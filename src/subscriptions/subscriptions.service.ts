import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPlan } from '@prisma/client';

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  basic: 5000,
  pro: 15000,
  enterprise: 45000,
};

const PLAN_LIMITS: Record<
  string,
  { users: number; properties: number; units: number }
> = {
  free: { users: 2, properties: 1, units: 10 },
  basic: { users: 5, properties: 3, units: 50 },
  pro: { users: 20, properties: 10, units: 200 },
  enterprise: { users: -1, properties: -1, units: -1 }, // -1 = без лимита
};

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  /** Возвращает текущую подписку тенанта */
  async getCurrent(tenantId: number) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) throw new NotFoundException('Подписка не найдена');

    const plan = sub.plan as string;
    return {
      ...sub,
      limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free,
      priceMonthly: PLAN_PRICES[plan] || 0,
    };
  }

  /** Возвращает доступные тарифы */
  getPlans() {
    return Object.entries(PLAN_PRICES).map(([plan, price]) => ({
      plan,
      priceMonthly: price,
      limits: PLAN_LIMITS[plan],
    }));
  }

  /** Выполняет смену тарифного плана */
  async changePlan(tenantId: number, newPlan: TenantPlan) {
    const current = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
    });

    if (!current) throw new NotFoundException('Активная подписка не найдена');
    if (current.plan === newPlan)
      throw new BadRequestException('Вы уже на этом тарифе');

    // Проверяем лимиты нового плана
    const limits = PLAN_LIMITS[newPlan];
    if (limits.users > 0) {
      const usersCount = await this.prisma.user.count({
        where: { tenantId, deletedAt: null },
      });
      if (usersCount > limits.users) {
        throw new BadRequestException(
          `Тариф ${newPlan} поддерживает макс. ${limits.users} пользователей, у вас ${usersCount}`,
        );
      }
    }
    if (limits.properties > 0) {
      const propsCount = await this.prisma.property.count({
        where: { tenantId, deletedAt: null },
      });
      if (propsCount > limits.properties) {
        throw new BadRequestException(
          `Тариф ${newPlan} поддерживает макс. ${limits.properties} объектов, у вас ${propsCount}`,
        );
      }
    }
    if (limits.units > 0) {
      const unitsCount = await this.prisma.unit.count({
        where: { tenantId, deletedAt: null },
      });
      if (unitsCount > limits.units) {
        throw new BadRequestException(
          `Тариф ${newPlan} поддерживает макс. ${limits.units} помещений, у вас ${unitsCount}`,
        );
      }
    }

    const now = new Date();
    // Безопасный расчёт +1 месяц (без overflow 31 янв → 3 марта)
    const periodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      Math.min(now.getDate(), 28),
    );

    return this.prisma.$transaction(async (tx) => {
      // Завершаем текущую подписку
      await tx.subscription.update({
        where: { id: current.id },
        data: {
          status: 'canceled',
          canceledAt: now,
          cancelReason: `Переход на ${newPlan}`,
        },
      });

      // Создаём новую
      const newSub = await tx.subscription.create({
        data: {
          tenantId,
          plan: newPlan,
          priceMonthly: PLAN_PRICES[newPlan],
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // Обновляем план в тенанте
      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: newPlan },
      });

      return newSub;
    });
  }

  /** Отменяет подписку */
  async cancel(tenantId: number, reason?: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
    });

    if (!sub) throw new NotFoundException('Активная подписка не найдена');

    return this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'canceled',
          canceledAt: new Date(),
          cancelReason: reason || 'Отменено пользователем',
        },
      });

      // Переводим на free и создаём бесплатную подписку
      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: 'free' },
      });

      const now = new Date();
      const periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        Math.min(now.getDate(), 28),
      );
      await tx.subscription.create({
        data: {
          tenantId,
          plan: 'free',
          priceMonthly: 0,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      return { message: 'Подписка отменена, тариф переведён на free' };
    });
  }

  /** Возвращает историю счетов по подписке */
  async getInvoices(tenantId: number) {
    return this.prisma.subscriptionInvoice.findMany({
      where: { subscription: { tenantId } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
