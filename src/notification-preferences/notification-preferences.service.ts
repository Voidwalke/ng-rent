import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: number) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) {
      return this.prisma.notificationPreference.create({
        data: {
          userId,
          settings: {
            email: true,
            push: true,
            invoiceReminder: true,
            contractExpiry: true,
            maintenanceUpdates: true,
            paymentConfirmation: true,
          },
        },
      });
    }
    return pref;
  }

  async updatePreferences(userId: number, settings: any) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: { settings },
      create: { userId, settings },
    });
  }

  // --- Webhooks ---

  async getWebhooks(tenantId: number) {
    return this.prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWebhook(tenantId: number, dto: any) {
    const crypto = await import('crypto');
    return this.prisma.webhook.create({
      data: {
        tenantId,
        url: dto.url,
        events: dto.events,
        secret: crypto.randomBytes(32).toString('hex'),
        isActive: true,
      },
    });
  }

  async deleteWebhook(id: number, tenantId: number) {
    const wh = await this.prisma.webhook.findFirst({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException('Webhook не найден');
    await this.prisma.webhook.delete({ where: { id } });
    return { message: 'Webhook удалён' };
  }
}
