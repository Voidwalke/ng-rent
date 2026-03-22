import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SubscriptionsCron {
  private readonly logger = new Logger(SubscriptionsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Списывает оплату по активным подпискам */
  @Cron('0 6 * * *')
  async chargeSubscriptions() {
    if (!(await this.redis.acquireLock('cron:charge-subscriptions', 3600))) return;
    try {
      const now = new Date();

      const expiring = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: { lte: now },
        },
        include: { tenant: true },
      });

      for (const sub of expiring) {
        try {
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
        } catch (err) {
          this.logger.error(`Ошибка продления подписки ${sub.id}: ${err.message}`);
        }
      }

      if (expiring.length > 0)
        this.logger.log(`Продлено подписок: ${expiring.length}`);
    } finally {
      await this.redis.releaseLock('cron:charge-subscriptions');
    }
  }

  /** Повторяет неуспешные платежи по подпискам */
  @Cron('30 6 * * *')
  async retryFailedPayments() {
    if (!(await this.redis.acquireLock('cron:retry-payments', 1800))) return;
    try {
      const failed = await this.prisma.subscriptionInvoice.findMany({
        where: { status: 'failed' },
      });

      for (const invoice of failed) {
        try {
          await this.prisma.subscriptionInvoice.update({
            where: { id: invoice.id },
            data: { status: 'pending' },
          });
        } catch (err) {
          this.logger.error(`Ошибка повтора платежа ${invoice.id}: ${err.message}`);
        }
      }

      if (failed.length > 0) this.logger.log(`Повтор платежей: ${failed.length}`);
    } finally {
      await this.redis.releaseLock('cron:retry-payments');
    }
  }

  /** Проверяет истечение пробного периода */
  @Cron('0 7 * * *')
  async checkTrialExpiry() {
    if (!(await this.redis.acquireLock('cron:trial-expiry', 3600))) return;
    try {
      const now = new Date();

      const expired = await this.prisma.subscription.findMany({
        where: {
          status: 'trialing',
          currentPeriodEnd: { lte: now },
        },
      });

      for (const sub of expired) {
        try {
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'canceled' },
          });

          await this.prisma.tenant.update({
            where: { id: sub.tenantId },
            data: { plan: 'free' },
          });
        } catch (err) {
          this.logger.error(`Ошибка отмены подписки ${sub.id}: ${err.message}`);
        }
      }

      if (expired.length > 0)
        this.logger.warn(`Истёк пробный период: ${expired.length} организаций`);
    } finally {
      await this.redis.releaseLock('cron:trial-expiry');
    }
  }
}
