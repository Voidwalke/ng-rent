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
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000;
  private consumers: Array<{
    queue: string;
    handler: (msg: QueueMessage) => Promise<void>;
  }> = [];

  static readonly QUEUES = {
    NOTIFICATIONS: 'notifications',
    DOCUMENT_GENERATION: 'document-generation',
    ACCESS_CONTROL: 'access-control',
    EXPORT_1C: 'export-1c',
  };

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    try {
      const url = this.config.get(
        'RABBIT_URL',
        'amqp://rabbit:rabbit@localhost:5672',
      );
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();

      // Prefetch — не больше 10 необработанных сообщений на consumer
      await this.channel.prefetch(10);

      // Создаём основные очереди + DLQ для каждой
      for (const queue of Object.values(QueueService.QUEUES)) {
        // Dead Letter Queue
        await this.channel.assertQueue(`${queue}.dlq`, { durable: true });

        // Основная очередь с DLQ routing
        await this.channel.assertQueue(queue, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': `${queue}.dlq`,
          },
        });
      }

      // Обработка разрыва соединения
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ: соединение закрыто, переподключаемся...');
        this.channel = null;
        this.connection = null;
        this.scheduleReconnect();
      });

      this.connection.on('error', (err: any) => {
        this.logger.error(`RabbitMQ: ошибка соединения: ${err.message}`);
      });

      this.reconnectAttempts = 0;
      this.logger.log('RabbitMQ подключён, очереди созданы');

      // Восстанавливаем consumers после реконнекта
      for (const { queue, handler } of this.consumers) {
        await this.setupConsumer(queue, handler);
      }
    } catch (err: any) {
      this.logger.warn(`RabbitMQ недоступен: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );
    this.logger.log(
      `RabbitMQ: переподключение через ${delay}мс (попытка ${this.reconnectAttempts})`,
    );
    setTimeout(() => this.connect(), delay);
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
    // Сохраняем для восстановления после реконнекта
    this.consumers.push({ queue, handler });

    if (!this.channel) {
      this.logger.warn(
        `RabbitMQ недоступен, consumer ${queue} будет запущен при подключении`,
      );
      return;
    }

    await this.setupConsumer(queue, handler);
  }

  private async setupConsumer(
    queue: string,
    handler: (msg: QueueMessage) => Promise<void>,
  ) {
    if (!this.channel) return;

    await this.channel.consume(queue, async (msg: any) => {
      if (!msg) return;

      const retryCount =
        (msg.properties.headers?.['x-retry-count'] as number) || 0;

      try {
        const parsed: QueueMessage = JSON.parse(msg.content.toString());
        await handler(parsed);
        this.channel!.ack(msg);
      } catch (err: any) {
        this.logger.error(`Ошибка обработки ${queue}: ${err.message}`);

        // После 3 попыток — в DLQ (nack без requeue)
        if (retryCount >= 3) {
          this.logger.warn(
            `Сообщение в ${queue} отправлено в DLQ после ${retryCount} попыток`,
          );
          this.channel!.nack(msg, false, false);
        } else {
          // Requeue с увеличенным счётчиком
          this.channel!.ack(msg);
          this.channel!.sendToQueue(queue, msg.content, {
            persistent: true,
            headers: { 'x-retry-count': retryCount + 1 },
          });
        }
      }
    });

    this.logger.log(`Consumer запущен: ${queue}`);
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
