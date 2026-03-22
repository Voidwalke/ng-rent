import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ContractGeneratorService } from './contract-generator.service';
import {
  IEdoProvider,
  MockEdoProvider,
  DiadocEdoProvider,
} from './providers/edo.provider';

@Injectable()
export class EdoService {
  private readonly logger = new Logger(EdoService.name);
  private readonly provider: IEdoProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly contractGenerator: ContractGeneratorService,
  ) {
    const edoProvider = this.config.get('EDO_PROVIDER', 'mock');
    if (edoProvider === 'diadoc') {
      this.provider = new DiadocEdoProvider(
        this.config.get('EDO_API_URL', ''),
        this.config.get('EDO_API_KEY', ''),
      );
      this.logger.log('ЭДО: подключён Контур.Диадок');
    } else {
      this.provider = new MockEdoProvider();
      this.logger.log('ЭДО: используется мок-провайдер');
    }
  }

  /** Отправляет договор на подпись через ЭДО */
  async sendForSigning(contractId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: true,
        unit: { include: { property: true } },
      },
    });
    if (!contract) throw new NotFoundException('Договор не найден');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: contract.tenantId },
    });

    // Генерируем PDF
    const pdfBuffer = await this.contractGenerator.generatePdf({
      tenant: tenant || {},
      client: contract.client || {},
      property: contract.unit?.property || {},
      unit: contract.unit || {},
      contract,
    });

    // Отправляем в ЭДО
    const signers = [
      { name: tenant?.name || '', inn: tenant?.inn || '' },
      {
        name: contract.client?.contactName || '',
        inn: contract.client?.inn || '',
      },
    ];

    const { documentId } = await this.provider.sendForSigning(
      pdfBuffer,
      signers,
    );

    // Сохраняем ID документа в ЭДО
    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        edoDocumentId: documentId,
        edoStatus: 'pending',
      },
    });

    this.logger.log(
      `ЭДО: договор ${contract.contractNumber} отправлен на подпись (${documentId})`,
    );

    return { documentId, status: 'pending' };
  }

  /** Проверяет статус подписания в ЭДО */
  async checkStatus(contractId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract?.edoDocumentId) {
      throw new NotFoundException('Документ не отправлен в ЭДО');
    }

    const { status } = await this.provider.checkStatus(contract.edoDocumentId);

    if (status !== contract.edoStatus) {
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { edoStatus: status },
      });

      if (status === 'signed') {
        await this.onDocumentSigned(contractId, contract.edoDocumentId);
      }
    }

    return { contractId, edoDocumentId: contract.edoDocumentId, status };
  }

  /** Массовая проверка статусов (вызывается из cron) */
  async checkAllPendingStatuses() {
    const pendingContracts = await this.prisma.contract.findMany({
      where: { edoStatus: 'pending', edoDocumentId: { not: null } },
    });

    let updated = 0;
    for (const contract of pendingContracts) {
      try {
        const { status } = await this.provider.checkStatus(
          contract.edoDocumentId!,
        );

        if (status !== 'pending') {
          await this.prisma.contract.update({
            where: { id: contract.id },
            data: { edoStatus: status },
          });

          if (status === 'signed') {
            await this.onDocumentSigned(contract.id, contract.edoDocumentId!);
          }

          updated++;
        }
      } catch (err: any) {
        this.logger.error(
          `ЭДО: ошибка проверки ${contract.contractNumber}: ${err.message}`,
        );
      }
    }

    if (updated > 0) {
      this.logger.log(`ЭДО: обновлено статусов: ${updated}`);
    }

    return { checked: pendingContracts.length, updated };
  }

  /** Скачивает подписанный документ из ЭДО */
  async downloadSigned(contractId: number): Promise<Buffer> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract?.edoDocumentId) {
      throw new NotFoundException('Документ не отправлен в ЭДО');
    }

    return this.provider.downloadSigned(contract.edoDocumentId);
  }

  /** Обрабатывает подписанный документ */
  private async onDocumentSigned(contractId: number, documentId: string) {
    // Скачиваем подписанный PDF
    const signedPdf = await this.provider.downloadSigned(documentId);

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) return;

    // Находим admin-пользователя тенанта для записи uploadedBy
    const adminUser = await this.prisma.user.findFirst({
      where: { tenantId: contract.tenantId, role: 'admin' },
      select: { id: true },
    });

    // Сохраняем подписанный документ
    await this.prisma.document.create({
      data: {
        tenantId: contract.tenantId,
        entityType: 'contract',
        entityId: contractId,
        fileName: `Договор_${contract.contractNumber}_подписан.pdf`,
        fileUrl: `documents/${contract.tenantId}/contracts/${contractId}_signed.pdf`,
        mimeType: 'application/pdf',
        category: 'contract',
        fileSize: signedPdf.length,
        uploadedBy: adminUser?.id ?? 1,
      },
    });

    this.logger.log(
      `ЭДО: документ ${contract.contractNumber} подписан и сохранён`,
    );
  }
}
