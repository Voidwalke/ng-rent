import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ContractGeneratorService } from './contract-generator.service';
import { ContractsService } from './contracts.service';
import { DocumentsService } from '../documents/documents.service';
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
    @Inject(forwardRef(() => ContractsService))
    private readonly contractsService: ContractsService,
    private readonly documentsService: DocumentsService,
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
    if (!['draft', 'signed'].includes(contract.status)) {
      throw new BadRequestException(
        'Отправить в ЭДО можно только договор в статусе draft или signed',
      );
    }
    if (contract.edoDocumentId) {
      throw new BadRequestException('Договор уже отправлен в ЭДО');
    }

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

    const fromBoxId = (tenant as any)?.edoBoxId;
    const toBoxId = (contract.client as any)?.edoBoxId;
    if (!fromBoxId || !toBoxId) {
      throw new BadRequestException(
        'Для отправки в ЭДО необходимо указать edoBoxId у организации и контрагента',
      );
    }

    const { documentId } = await this.provider.sendForSigning(
      pdfBuffer,
      signers,
      { fromBoxId, toBoxId },
    );

    // Сохраняем ID документа в ЭДО
    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        edoDocumentId: documentId,
        edoStatus: 'pending',
        edoSentAt: new Date(),
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

  /** Обрабатывает подписанный документ — запускает бизнес-логику */
  private async onDocumentSigned(contractId: number, documentId: string) {
    const signedPdf = await this.provider.downloadSigned(documentId);

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { client: true },
    });
    if (!contract) return;

    // Если контракт ещё не подписан — запускаем полный sign flow
    // (счета, СКУД, статус помещения, статус заявки)
    if (['draft', 'sent'].includes(contract.status)) {
      await this.contractsService.sign(contractId, contract.tenantId);
    }

    // Загружаем подписанный PDF в MinIO через DocumentsService
    const adminUser = await this.prisma.user.findFirst({
      where: { tenantId: contract.tenantId, role: 'admin' },
      select: { id: true },
    });

    const fakeFile = {
      buffer: signedPdf,
      originalname: `Договор_${contract.contractNumber}_подписан.pdf`,
      size: signedPdf.length,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const doc = await this.documentsService.upload(
      contract.tenantId,
      adminUser?.id ?? 1,
      fakeFile,
      'contract',
      contractId,
      'contract',
    );

    // Записываем URL подписанного PDF на контракт
    await this.prisma.contract.update({
      where: { id: contractId },
      data: { signedPdfUrl: doc.fileUrl },
    });

    this.logger.log(
      `ЭДО: документ ${contract.contractNumber} подписан и сохранён`,
    );
  }
}
