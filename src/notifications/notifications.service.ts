import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import * as webpush from 'web-push';

export type NotificationType =
  | 'application_submitted'
  | 'application_approved'
  | 'application_rejected'
  | 'contract_sent'
  | 'contract_signed'
  | 'invoice_created'
  | 'invoice_due_soon'
  | 'invoice_overdue'
  | 'access_blocked'
  | 'access_restored';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private pushEnabled = false;

  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
    private config: ConfigService,
  ) {
    const vapidPublic = this.config.get('VAPID_PUBLIC_KEY', '');
    const vapidPrivate = this.config.get('VAPID_PRIVATE_KEY', '');
    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(
        'mailto:support@ngrent.ru',
        vapidPublic,
        vapidPrivate,
      );
      this.pushEnabled = true;
      this.logger.log('Web Push уведомления включены');
    }
  }

  /** Создаёт уведомление и отправляет через WebSocket */
  async create(data: {
    tenantId: number;
    userId: number;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: any;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || {},
      },
    });

    this.gateway.sendToUser(data.userId, 'notification', {
      id: notification.id,
      type: data.type,
      title: data.title,
      message: data.message,
      createdAt: notification.createdAt,
    });

    // Push-уведомление
    await this.sendPush(data.userId, data.title, data.message);

    return notification;
  }

  /** Отправляет уведомление всем менеджерам тенанта */
  async notifyManagers(
    tenantId: number,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: any,
  ) {
    const managers = await this.prisma.user.findMany({
      where: { tenantId, role: { in: ['admin', 'manager'] }, deletedAt: null },
      select: { id: true },
    });

    const notifications = await Promise.all(
      managers.map((m) =>
        this.create({ tenantId, userId: m.id, type, title, message, metadata }),
      ),
    );

    return notifications;
  }

  /** Возвращает список уведомлений пользователя */
  async findAll(
    userId: number,
    filters?: {
      isRead?: boolean;
      type?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const where: any = { userId };
    if (filters?.isRead !== undefined) {
      where.readAt = filters.isRead ? { not: null } : null;
    }
    if (filters?.type) where.type = filters.type;

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Отмечает уведомление как прочитанное */
  async markAsRead(userId: number, id: number) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Уведомление не найдено');

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Отмечает все уведомления как прочитанные */
  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { message: 'Все уведомления прочитаны' };
  }

  /** Отправляет push-уведомление на все устройства пользователя */
  private async sendPush(userId: number, title: string, body: string) {
    if (!this.pushEnabled) return;

    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId },
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth },
            },
            JSON.stringify({ title, body }),
          );
        } catch (err: any) {
          // 410 Gone — подписка недействительна, удаляем
          if (err.statusCode === 410) {
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
            this.logger.log(`Push подписка ${sub.id} удалена (410 Gone)`);
          } else {
            this.logger.error(`Push ошибка для ${sub.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Push уведомления: ${err.message}`);
    }
  }

  /** Возвращает количество непрочитанных уведомлений */
  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }
}
