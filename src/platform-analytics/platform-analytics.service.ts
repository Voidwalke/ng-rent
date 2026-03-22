import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PlatformAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /** Возвращает MRR — ежемесячную выручку платформы */
  async getMrr() {
    const cached = await this.redis.get<any>('platform:mrr');
    if (cached) return cached;

    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      select: { priceMonthly: true, plan: true },
    });

    const mrr = activeSubscriptions.reduce(
      (sum, s) => sum + Number(s.priceMonthly),
      0,
    );
    const arr = mrr * 12;

    const byPlan = activeSubscriptions.reduce((acc: any, s) => {
      acc[s.plan] = (acc[s.plan] || 0) + 1;
      return acc;
    }, {});

    const result = {
      mrr,
      arr,
      totalActive: activeSubscriptions.length,
      byPlan,
    };
    await this.redis.set('platform:mrr', result, 900);
    return result;
  }

  /** Возвращает статистику по тенантам */
  async getTenantStats() {
    const cached = await this.redis.get<any>('platform:tenants');
    if (cached) return cached;

    const [total, active, byPlan] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { isActive: true } }),
      this.prisma.tenant.groupBy({ by: ['plan'], _count: true }),
    ]);

    // Новые за месяц
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const newThisMonth = await this.prisma.tenant.count({
      where: { createdAt: { gte: monthAgo } },
    });

    const result = {
      total,
      active,
      newThisMonth,
      byPlan: byPlan.reduce(
        (acc: any, p) => ({ ...acc, [p.plan]: p._count }),
        {},
      ),
    };

    await this.redis.set('platform:tenants', result, 900);
    return result;
  }

  /** Возвращает воронку: регистрация → онбординг → оплата */
  async getFunnel() {
    const [registered, completedOnboarding, paid] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.onboardingProgress.count({ where: { isCompleted: true } }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
    ]);

    return {
      registered,
      completedOnboarding,
      paid,
      onboardingRate: registered
        ? Math.round((completedOnboarding / registered) * 100)
        : 0,
      conversionRate: registered ? Math.round((paid / registered) * 100) : 0,
    };
  }

  /** Возвращает отток (Churn) за месяц */
  async getChurn() {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [canceled, activeAtStart] = await Promise.all([
      this.prisma.subscription.count({
        where: { status: 'canceled', canceledAt: { gte: monthAgo } },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: ['active', 'canceled'] },
          createdAt: { lt: monthAgo },
        },
      }),
    ]);

    return {
      canceledThisMonth: canceled,
      churnRate: activeAtStart
        ? Math.round((canceled / activeAtStart) * 100)
        : 0,
    };
  }
}
