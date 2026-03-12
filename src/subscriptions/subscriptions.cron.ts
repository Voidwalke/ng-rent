import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsCron {
  private readonly logger = new Logger(SubscriptionsCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Списывает оплату по активным подпискам */
  @Cron('0 6 * * *')
  async chargeSubscriptions() {
    const now = new Date();

    const expiring = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        currentPeriodEnd: { lte: now },
      },
      include: { tenant: true },
    });

    for (const sub of expiring) {
      const newStart = new Date(sub.currentPeriodEnd);
      const newEnd = new Date(newStart);
      newEnd.setMonth(newEnd.getMonth() + 1);

      const dueDate = new Date(newStart);
      dueDate.setDate(dueDate.getDate() + 14);

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodStart: newStart, currentPeriodEnd: newEnd },
      });

      await this.prisma.subscriptionInvoice.create({
        data: {
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          amount: sub.priceMonthly,
          periodStart: newStart,
          periodEnd: newEnd,
          dueDate,
          status: 'pending',
        },
      });
    }

    if (expiring.length > 0)
      this.logger.log(`Продлено подписок: ${expiring.length}`);
  }

  /** Повторяет неуспешные платежи по подпискам */
  @Cron('30 6 * * *')
  async retryFailedPayments() {
    const failed = await this.prisma.subscriptionInvoice.findMany({
      where: { status: 'failed' },
    });

    for (const invoice of failed) {
      await this.prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: 'pending' },
      });
    }

    if (failed.length > 0) this.logger.log(`Повтор платежей: ${failed.length}`);
  }

  /** Проверяет истечение пробного периода */
  @Cron('0 7 * * *')
  async checkTrialExpiry() {
    const now = new Date();

    const expired = await this.prisma.subscription.findMany({
      where: {
        status: 'trialing',
        currentPeriodEnd: { lte: now },
      },
    });

    for (const sub of expired) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'canceled' },
      });

      await this.prisma.tenant.update({
        where: { id: sub.tenantId },
        data: { plan: 'free' },
      });
    }

    if (expired.length > 0)
      this.logger.warn(`Истёк пробный период: ${expired.length} организаций`);
  }
}
