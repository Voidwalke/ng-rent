import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export interface QueueMessage {
  type: string;
  payload: any;
  tenantId?: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: any = null;
  private channel: any = null;

  static readonly QUEUES = {
    NOTIFICATIONS: 'notifications',
    DOCUMENT_GENERATION: 'document-generation',
    ACCESS_CONTROL: 'access-control',
    EXPORT_1C: 'export-1c',
  };

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    try {
      const url = this.config.get(
        'RABBIT_URL',
        'amqp://rabbit:rabbit@localhost:5672',
      );
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();

      for (const queue of Object.values(QueueService.QUEUES)) {
        await this.channel.assertQueue(queue, { durable: true });
      }

      this.logger.log('RabbitMQ подключён, очереди созданы');
    } catch (err: any) {
      this.logger.warn(`RabbitMQ недоступен: ${err.message}`);
    }
  }

  /** Отправляет сообщение в очередь */
  async publish(queue: string, message: QueueMessage) {
    if (!this.channel) {
      this.logger.warn(`RabbitMQ недоступен, сообщение в ${queue} пропущено`);
      return;
    }

    this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });

    this.logger.debug(`Отправлено в ${queue}: ${message.type}`);
  }

  /** Подписывается на очередь для обработки сообщений */
  async consume(queue: string, handler: (msg: QueueMessage) => Promise<void>) {
    if (!this.channel) {
      this.logger.warn('RabbitMQ недоступен, consumer не запущен');
      return;
    }

    await this.channel.consume(queue, async (msg: any) => {
      if (!msg) return;

      try {
        const parsed: QueueMessage = JSON.parse(msg.content.toString());
        await handler(parsed);
        this.channel!.ack(msg);
      } catch (err: any) {
        this.logger.error(`Ошибка обработки: ${err.message}`);
        this.channel!.nack(msg, false, true);
      }
    });

    this.logger.log(`Consumer запущен: ${queue}`);
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
