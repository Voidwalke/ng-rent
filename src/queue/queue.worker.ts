import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { QueueService, QueueMessage } from './queue.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractGeneratorService } from '../contracts/contract-generator.service';
import { DocumentsService } from '../documents/documents.service';
import type { IAccessControlProvider } from '../access-control/access-control.provider';

@Injectable()
export class QueueWorker implements OnModuleInit {
  private readonly logger = new Logger(QueueWorker.name);

  constructor(
    private queue: QueueService,
    private mailer: MailerService,
    private notifications: NotificationsService,
    private prisma: PrismaService,
    private contractGenerator: ContractGeneratorService,
    private documentsService: DocumentsService,
    @Inject('ACCESS_CONTROL_PROVIDER')
    private accessProvider: IAccessControlProvider,
  ) {}

  async onModuleInit() {
    await this.queue.consume(QueueService.QUEUES.NOTIFICATIONS, async (msg) => {
      await this.handleNotification(msg);
    });

    await this.queue.consume(
      QueueService.QUEUES.DOCUMENT_GENERATION,
      async (msg) => {
        await this.handleDocumentGeneration(msg);
      },
    );

    await this.queue.consume(
      QueueService.QUEUES.ACCESS_CONTROL,
      async (msg) => {
        await this.handleAccessControl(msg);
      },
    );

    await this.queue.consume(QueueService.QUEUES.EXPORT_1C, async (msg) => {
      await this.handleExport1C(msg);
    });
  }

  private async handleNotification(msg: QueueMessage) {
    const { type, payload } = msg;

    if (payload.userId) {
      await this.notifications.create({
        tenantId: payload.tenantId,
        userId: payload.userId,
        type: type as any,
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata,
      });
    }

    if (payload.email && payload.emailTemplate) {
      await this.mailer.send(
        payload.email,
        payload.title,
        payload.emailTemplate,
        payload.emailData || {},
      );
    }

    this.logger.log(`Уведомление обработано: ${type}`);
  }

  private async handleDocumentGeneration(msg: QueueMessage) {
    const { contractId, tenantId } = msg.payload || {};
    if (!contractId) return;

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        client: true,
        unit: { include: { property: true } },
      },
    });
    if (!contract) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId || contract.tenantId },
    });

    // Генерируем PDF через ContractGeneratorService
    const pdfBuffer = await this.contractGenerator.generatePdf({
      tenant: tenant || {},
      client: contract.client || {},
      property: contract.unit?.property || {},
      unit: contract.unit || {},
      contract,
    });

    // Загружаем PDF в MinIO через DocumentsService
    const fakeFile = {
      buffer: pdfBuffer,
      originalname: `Договор_${contract.contractNumber}.pdf`,
      size: pdfBuffer.length,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await this.documentsService.upload(
      contract.tenantId,
      msg.payload?.userId || 1,
      fakeFile,
      'contract',
      contractId,
      'contract',
    );

    this.logger.log(
      `PDF сгенерирован и загружен в S3: договор ${contract.contractNumber}, ${pdfBuffer.length} байт`,
    );
  }

  private async handleAccessControl(msg: QueueMessage) {
    const { cardNumber, action, zones, validFrom, validTo, reason } =
      msg.payload || {};
    if (!cardNumber) return;

    if (action === 'grant') {
      await this.accessProvider.grantAccess({
        cardNumber,
        zones: zones || [],
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validTo: validTo ? new Date(validTo) : new Date(),
      });
      this.logger.log(
        `СКУД: доступ выдан ${cardNumber}, зоны: ${(zones || []).join(', ')}`,
      );
    } else if (action === 'revoke') {
      await this.accessProvider.revokeAccess({
        cardNumber,
        reason: reason || 'Отозвано через очередь',
      });
      this.logger.log(`СКУД: доступ отозван ${cardNumber}, причина: ${reason}`);
    }
  }

  private async handleExport1C(msg: QueueMessage) {
    this.logger.log(
      `Экспорт в 1С: ${msg.type}, payload: ${JSON.stringify(msg.payload)}`,
    );
    // Реальная обработка выполняется в integration-1c.service через cron
    // Очередь используется для ручных экспортов и повторных попыток
  }
}
