import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: number): Promise<DashboardData> {
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
      this.prisma.contract.count({ where: { tenantId, status: 'active' } }),
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

    // Средняя арендная ставка за м²
    const avgResult = await this.prisma.contract.aggregate({
      where: { tenantId, status: 'active' },
      _avg: { monthlyRent: true },
    });

    return {
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
  }

  async getRevenue(tenantId: number, months: number = 6) {
    const result: { month: string; revenue: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const sum = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: 'paid',
          paidAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      });

      result.push({
        month: startOfMonth.toISOString().slice(0, 7),
        revenue: Number(sum._sum.amount) || 0,
      });
    }

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
