import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface DashboardData {
  totalProperties: number;
  totalUnits: number;
  occupancyRate: number;
  monthlyRevenue: number;
  overdueInvoices: number;
  overdueRate: number;
  activeContracts: number;
  pendingApplications: number;
  avgRentPerSqm: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Возвращает сводку показателей для дашборда */
  async getDashboard(tenantId: number): Promise<DashboardData> {
    const cacheKey = `analytics:dashboard:${tenantId}`;
    const cached = await this.redis.get<DashboardData>(cacheKey);
    if (cached) return cached;

    const [
      totalProperties,
      totalUnits,
      rentedUnits,
      activeContracts,
      pendingApplications,
      paidThisMonth,
      totalInvoices,
      overdueInvoices,
    ] = await Promise.all([
      this.prisma.property.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.unit.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.unit.count({
        where: { tenantId, status: 'rented', deletedAt: null },
      }),
      this.prisma.contract.count({
        where: { tenantId, status: { in: ['signed', 'active'] } },
      }),
      this.prisma.application.count({
        where: { tenantId, status: { in: ['submitted', 'under_review'] } },
      }),
      this.getMonthlyRevenue(tenantId),
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'overdue' } }),
    ]);

    const occupancyRate =
      totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;

    const overdueRate =
      totalInvoices > 0
        ? Math.round((overdueInvoices / totalInvoices) * 100)
        : 0;

    const avgResult = await this.prisma.contract.aggregate({
      where: { tenantId, status: 'active' },
      _avg: { monthlyRent: true },
    });

    const result: DashboardData = {
      totalProperties,
      totalUnits,
      occupancyRate,
      monthlyRevenue: paidThisMonth,
      overdueInvoices,
      overdueRate,
      activeContracts,
      pendingApplications,
      avgRentPerSqm: Number(avgResult._avg.monthlyRent) || 0,
    };

    await this.redis.set(cacheKey, result, 900);
    return result;
  }

  /** Возвращает помесячную выручку за указанный период */
  async getRevenue(tenantId: number, months: number = 6) {
    const cacheKey = `analytics:revenue:${tenantId}:${months}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months + 1);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    // Один запрос вместо N
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'paid',
        paidAt: { gte: startDate },
      },
      select: { amount: true, paidAt: true },
    });

    // Группировка по месяцам в памяти
    const revenueMap = new Map<string, number>();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      revenueMap.set(
        new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 7),
        0,
      );
    }

    for (const inv of invoices) {
      if (!inv.paidAt) continue;
      const key = inv.paidAt.toISOString().slice(0, 7);
      if (revenueMap.has(key)) {
        revenueMap.set(key, revenueMap.get(key)! + Number(inv.amount));
      }
    }

    const result = Array.from(revenueMap.entries()).map(([month, revenue]) => ({
      month,
      revenue,
    }));

    await this.redis.set(cacheKey, result, 900);
    return result;
  }

  private async getMonthlyRevenue(tenantId: number): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await this.prisma.invoice.aggregate({
      where: {
        tenantId,
        status: 'paid',
        paidAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount) || 0;
  }
}
