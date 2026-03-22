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

  /** Возвращает просроченную задолженность с разбивкой по срокам */
  async getAgedDebt(tenantId: number) {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'overdue' },
      include: {
        contract: {
          select: {
            contractNumber: true,
            client: { select: { companyName: true } },
          },
        },
      },
    });

    const buckets = {
      '0-30': [] as any[],
      '31-60': [] as any[],
      '61-90': [] as any[],
      '90+': [] as any[],
    };
    for (const inv of invoices) {
      const days = Math.floor(
        (now.getTime() - new Date(inv.dueDate).getTime()) / 86400000,
      );
      const bucket =
        days <= 30
          ? '0-30'
          : days <= 60
            ? '31-60'
            : days <= 90
              ? '61-90'
              : '90+';
      buckets[bucket].push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.totalAmount),
        daysOverdue: days,
        client: inv.contract?.client?.companyName,
        contract: inv.contract?.contractNumber,
      });
    }

    return {
      buckets,
      totals: Object.fromEntries(
        Object.entries(buckets).map(([k, v]) => [
          k,
          { count: v.length, amount: v.reduce((s, i) => s + i.amount, 0) },
        ]),
      ),
    };
  }

  /** Возвращает заполняемость по объектам */
  async getOccupancy(tenantId: number) {
    const properties = await this.prisma.property.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        units: {
          where: { deletedAt: null },
          select: { id: true, status: true, areaSqm: true },
        },
      },
    });

    return properties.map((p) => {
      const total = p.units.length;
      const rented = p.units.filter((u) => u.status === 'rented').length;
      const totalArea = p.units.reduce((s, u) => s + Number(u.areaSqm), 0);
      const rentedArea = p.units
        .filter((u) => u.status === 'rented')
        .reduce((s, u) => s + Number(u.areaSqm), 0);
      return {
        propertyId: p.id,
        propertyName: p.name,
        totalUnits: total,
        rentedUnits: rented,
        occupancyRate: total > 0 ? Math.round((rented / total) * 100) : 0,
        totalArea,
        rentedArea,
        areaOccupancy:
          totalArea > 0 ? Math.round((rentedArea / totalArea) * 100) : 0,
      };
    });
  }

  /** Возвращает денежный поток по месяцам (начисления vs оплаты) */
  async getCashflow(tenantId: number, months = 6) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months + 1);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, createdAt: { gte: startDate } },
        select: { totalAmount: true, createdAt: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, status: 'succeeded', createdAt: { gte: startDate } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const map = new Map<string, { billed: number; collected: number }>();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      map.set(
        new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 7),
        { billed: 0, collected: 0 },
      );
    }

    for (const inv of invoices) {
      const key = inv.createdAt.toISOString().slice(0, 7);
      if (map.has(key)) map.get(key)!.billed += Number(inv.totalAmount);
    }
    for (const pay of payments) {
      const key = pay.createdAt.toISOString().slice(0, 7);
      if (map.has(key)) map.get(key)!.collected += Number(pay.amount);
    }

    return Array.from(map.entries()).map(([month, data]) => ({
      month,
      ...data,
    }));
  }

  /** Возвращает стоимость простоя (упущенную выгоду от пустующих помещений) */
  async getVacancyCost(tenantId: number) {
    const vacantUnits = await this.prisma.unit.findMany({
      where: { tenantId, status: 'available', deletedAt: null },
      include: { property: { select: { name: true } } },
    });

    const items = vacantUnits.map((u) => ({
      unitId: u.id,
      unitNumber: u.unitNumber,
      floor: u.floor,
      areaSqm: Number(u.areaSqm),
      priceMonth: Number(u.priceMonth),
      property: u.property.name,
    }));

    const totalMonthlyLoss = items.reduce((s, i) => s + i.priceMonth, 0);

    return {
      vacantUnits: items,
      totalVacantUnits: items.length,
      totalMonthlyLoss,
      totalAnnualLoss: totalMonthlyLoss * 12,
    };
  }

  /** Экспортирует аналитику в JSON */
  async exportAnalytics(tenantId: number) {
    const [dashboard, revenue, occupancy, agedDebt, cashflow, vacancyCost] =
      await Promise.all([
        this.getDashboard(tenantId),
        this.getRevenue(tenantId, 12),
        this.getOccupancy(tenantId),
        this.getAgedDebt(tenantId),
        this.getCashflow(tenantId, 12),
        this.getVacancyCost(tenantId),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      dashboard,
      revenue,
      occupancy,
      agedDebt,
      cashflow,
      vacancyCost,
    };
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
