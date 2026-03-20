import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService, QueueMessage } from './queue.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QueueWorker implements OnModuleInit {
  private readonly logger = new Logger(QueueWorker.name);

  constructor(
    private queue: QueueService,
    private mailer: MailerService,
    private notifications: NotificationsService,
    private prisma: PrismaService,
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

    // Создаём запись документа (PDF генерируется на фронте или через внешний сервис)
    await this.prisma.document.create({
      data: {
        tenantId,
        entityType: 'contract',
        entityId: contractId,
        fileName: `Договор_${contract.contractNumber}.pdf`,
        fileUrl: `documents/${tenantId}/contracts/${contractId}.pdf`,
        mimeType: 'application/pdf',
        category: 'contract',
        uploadedBy: msg.payload?.userId,
      },
    });

    this.logger.log(`Документ создан: договор ${contract.contractNumber}`);
  }

  private async handleAccessControl(msg: QueueMessage) {
    const { cardNumber, action, zones, _validFrom, _validTo, reason } =
      msg.payload || {};
    if (!cardNumber) return;

    if (action === 'grant') {
      this.logger.log(
        `СКУД: доступ выдан ${cardNumber}, зоны: ${(zones || []).join(', ')}`,
      );
    } else if (action === 'revoke') {
      this.logger.log(`СКУД: доступ отозван ${cardNumber}, причина: ${reason}`);
    }
  }
}
