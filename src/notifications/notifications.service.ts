import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export enum NotificationType {
  APPLICATION_SUBMITTED = 'application_submitted',
  APPLICATION_APPROVED = 'application_approved',
  APPLICATION_REJECTED = 'application_rejected',
  CONTRACT_SENT = 'contract_sent',
  CONTRACT_SIGNED = 'contract_signed',
  INVOICE_CREATED = 'invoice_created',
  INVOICE_DUE_SOON = 'invoice_due_soon',
  INVOICE_OVERDUE = 'invoice_overdue',
  ACCESS_BLOCKED = 'access_blocked',
  ACCESS_RESTORED = 'access_restored',
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Создать уведомление (вызывается из других сервисов)
  async create(params: {
    tenantId: number;
    userId: number;
    type: string;
    title: string;
    message: string;
    metadata?: any;
  }) {
    return this.prisma.notification.create({ data: params });
  }

  // Отправить уведомление всем менеджерам tenant
  async notifyManagers(
    tenantId: number,
    type: string,
    title: string,
    message: string,
    metadata?: any,
  ) {
    const managers = await this.prisma.user.findMany({
      where: { tenantId, role: { in: ['admin', 'manager'] }, deletedAt: null },
      select: { id: true },
    });

    await this.prisma.notification.createMany({
      data: managers.map((m) => ({
        tenantId,
        userId: m.id,
        type,
        title,
        message,
        metadata,
      })),
    });
  }

  async findAll(userId: number, filters?: { isRead?: boolean; type?: string }) {
    const where: any = { userId };
    if (filters?.isRead !== undefined) where.isRead = filters.isRead;
    if (filters?.type) where.type = filters.type;

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: number, userId: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Уведомление не найдено');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }
}
