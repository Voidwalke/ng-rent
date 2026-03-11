import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService, QueueMessage } from './queue.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class QueueWorker implements OnModuleInit {
  private readonly logger = new Logger(QueueWorker.name);

  constructor(
    private queue: QueueService,
    private mailer: MailerService,
    private notifications: NotificationsService,
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
    // TODO: генерация PDF через ContractGeneratorService + загрузка в MinIO
    this.logger.log(
      `Генерация документа: ${msg.type}, contract=${msg.payload?.contractId}`,
    );
  }

  private async handleAccessControl(msg: QueueMessage) {
    // TODO: отправка команды в СКУД через AccessControlProvider
    this.logger.log(
      `СКУД команда: ${msg.type}, card=${msg.payload?.cardNumber}`,
    );
  }
}
