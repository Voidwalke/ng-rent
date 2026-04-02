import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

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

  /** Все пользователи платформы */
  async getAllUsers(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: { tenant: { select: { name: true, plan: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return {
      data: data.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        tenantName: u.tenant?.name,
        tenantPlan: u.tenant?.plan,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        is2faEnabled: u.is2faEnabled,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  /** Все платежи платформы */
  async getAllPayments(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: { tenant: { select: { name: true } }, invoice: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count(),
    ]);
    const totalAmount = await this.prisma.payment.aggregate({
      where: { status: 'succeeded' },
      _sum: { amount: true },
    });
    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      totalSucceeded: Number(totalAmount._sum.amount) || 0,
    };
  }

  /** Аудит-лог всей платформы */
  async getAuditLogs(page = 1, limit = 30) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { fullName: true, email: true } },
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Детали тенанта — его KPI */
  async getTenantDetail(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscriptions: true } });
    if (!tenant) throw new NotFoundException('Тенант не найден');
    const [users, properties, units, contracts, invoices, overdueSum] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.property.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.unit.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.contract.count({ where: { tenantId, status: { in: ['signed', 'active'] } } }),
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'overdue' }, _sum: { totalAmount: true } }),
    ]);
    const rentedUnits = await this.prisma.unit.count({ where: { tenantId, status: 'rented', deletedAt: null } });
    return {
      ...tenant,
      stats: { users, properties, units, rentedUnits, occupancy: units > 0 ? Math.round((rentedUnits / units) * 100) : 0, contracts, invoices, overdueAmount: Number(overdueSum._sum.totalAmount) || 0 },
    };
  }

  /** Сменить тариф тенанту */
  async changeTenantPlan(tenantId: number, plan: string) {
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { plan: plan as any } });
    await this.prisma.subscription.updateMany({ where: { tenantId, status: 'active' }, data: { plan: plan as any } });
    return { message: `Тариф изменён на ${plan}` };
  }

  /** Продлить триал */
  async extendTrial(tenantId: number, days: number) {
    const sub = await this.prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    if (!sub) throw new NotFoundException('Подписка не найдена');
    const newEnd = new Date(sub.currentPeriodEnd || Date.now());
    newEnd.setDate(newEnd.getDate() + days);
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: newEnd, status: 'trialing' } });
    return { message: `Триал продлён на ${days} дней` };
  }

  /** Сбросить пароль юзеру */
  async resetUserPassword(userId: number) {
    const newPass = crypto.randomBytes(6).toString('hex');
    const hash = await bcrypt.hash(newPass, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    return { newPassword: newPass };
  }

  /** Заблокировать/разблокировать юзера */
  async toggleUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    const newDeleted = user.deletedAt ? null : new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { deletedAt: newDeleted } });
    return { blocked: !!newDeleted };
  }

  /** Принудительный logout юзера */
  async forceLogout(userId: number) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    await this.redis.del(`session:${userId}`);
    return { message: 'Сессия завершена' };
  }

  /** Массовое оповещение всем тенантам */
  async broadcastNotification(title: string, msg: string) {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } });
    let count = 0;
    for (const t of tenants) {
      const users = await this.prisma.user.findMany({ where: { tenantId: t.id, deletedAt: null }, select: { id: true } });
      for (const u of users) {
        await this.prisma.notification.create({ data: { tenantId: t.id, userId: u.id, title, message: msg, type: 'system' } });
        count++;
      }
    }
    return { sent: count, tenants: tenants.length };
  }

  /** Экспорт всей платформы */
  async exportPlatform() {
    const [tenants, users, subscriptions] = await Promise.all([
      this.prisma.tenant.findMany({ select: { id: true, name: true, slug: true, plan: true, isActive: true, createdAt: true } }),
      this.prisma.user.count(),
      this.prisma.subscription.findMany({ where: { status: 'active' }, select: { tenantId: true, plan: true, priceMonthly: true } }),
    ]);
    const mrr = subscriptions.reduce((s, sub) => s + Number(sub.priceMonthly), 0);
    return { exportedAt: new Date().toISOString(), tenants, totalUsers: users, activeSubscriptions: subscriptions.length, mrr, arr: mrr * 12 };
  }

  /** Статус сервисов */
  async getSystemHealth() {
    const checks: Record<string, string> = {};
    // Database
    try { await this.prisma.$queryRaw`SELECT 1`; checks.database = 'ok'; } catch { checks.database = 'error'; }
    // Redis
    try { await this.redis.set('health:ping', 'pong', 10); checks.redis = 'ok'; } catch { checks.redis = 'error'; }
    // Counts
    const [users, tenants, invoices, contracts] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.tenant.count(),
      this.prisma.invoice.count(),
      this.prisma.contract.count(),
    ]);
    return { services: checks, counts: { users, tenants, invoices, contracts }, uptime: process.uptime(), memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) };
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
