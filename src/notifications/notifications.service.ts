import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

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
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

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

  /** Возвращает количество непрочитанных уведомлений */
  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }
}
