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

  // ── Django-style Admin CRUD ──────────────────────────

  /** Возвращает записи любой модели с пагинацией, поиском и сортировкой */
  async browseModel(model: string, opts: { page?: number; limit?: number; search?: string; sort?: string; order?: 'asc' | 'desc' } = {}) {
    const page = opts.page || 1;
    const limit = Math.min(opts.limit || 25, 100);
    const order = opts.order || 'desc';
    const sortField = opts.sort || 'createdAt';

    const delegate = (this.prisma as any)[model];
    if (!delegate?.findMany) throw new NotFoundException(`Модель "${model}" не найдена`);

    const where = opts.search ? this.buildSearchWhere(model, opts.search) : {};

    const [data, total] = await Promise.all([
      delegate.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { [sortField]: order }, include: this.getModelIncludes(model) }),
      delegate.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit), model };
  }

  /** Возвращает одну запись модели по ID */
  async getModelRecord(model: string, id: number) {
    const delegate = (this.prisma as any)[model];
    if (!delegate?.findUnique) throw new NotFoundException(`Модель "${model}" не найдена`);
    const record = await delegate.findUnique({ where: { id }, include: this.getModelIncludes(model) });
    if (!record) throw new NotFoundException(`Запись #${id} не найдена`);
    return record;
  }

  /** Обновляет запись модели */
  async updateModelRecord(model: string, id: number, data: Record<string, any>) {
    const delegate = (this.prisma as any)[model];
    if (!delegate?.update) throw new NotFoundException(`Модель "${model}" не найдена`);
    const cleaned = this.cleanUpdateData(data);
    return delegate.update({ where: { id }, data: cleaned });
  }

  /** Создаёт запись модели */
  async createModelRecord(model: string, data: Record<string, any>) {
    const delegate = (this.prisma as any)[model];
    if (!delegate?.create) throw new NotFoundException(`Модель "${model}" не найдена`);
    const cleaned = this.cleanUpdateData(data);
    return delegate.create({ data: cleaned });
  }

  /** Массовое удаление записей модели */
  async bulkDeleteModelRecords(model: string, ids: number[]) {
    const delegate = (this.prisma as any)[model];
    if (!delegate?.deleteMany) throw new NotFoundException(`Модель "${model}" не найдена`);
    const result = await delegate.deleteMany({ where: { id: { in: ids } } });
    return { deleted: result.count };
  }

  /** Удаляет запись модели */
  async deleteModelRecord(model: string, id: number) {
    const delegate = (this.prisma as any)[model];
    if (!delegate?.delete) throw new NotFoundException(`Модель "${model}" не найдена`);
    return delegate.delete({ where: { id } });
  }

  /** Возвращает схему полей модели */
  getModelFields(model: string) {
    const schemas: Record<string, { fields: { name: string; type: string; required: boolean }[] }> = {
      tenant: { fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'slug', type: 'string', required: true },
        { name: 'contactEmail', type: 'string', required: true },
        { name: 'inn', type: 'string', required: false },
        { name: 'plan', type: 'select:free,basic,pro,enterprise', required: true },
        { name: 'isActive', type: 'boolean', required: false },
      ]},
      user: { fields: [
        { name: 'email', type: 'string', required: true },
        { name: 'fullName', type: 'string', required: true },
        { name: 'phone', type: 'string', required: false },
        { name: 'role', type: 'select:super_admin,admin,manager,tenant', required: true },
        { name: 'tenantId', type: 'number', required: true },
        { name: 'is2faEnabled', type: 'boolean', required: false },
      ]},
      property: { fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'address', type: 'string', required: true },
        { name: 'city', type: 'string', required: false },
        { name: 'type', type: 'select:office,retail,warehouse,mixed', required: true },
        { name: 'totalArea', type: 'number', required: true },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      unit: { fields: [
        { name: 'unitNumber', type: 'string', required: false },
        { name: 'floor', type: 'number', required: true },
        { name: 'areaSqm', type: 'number', required: true },
        { name: 'priceMonth', type: 'number', required: true },
        { name: 'status', type: 'select:available,rented,maintenance', required: true },
        { name: 'propertyId', type: 'number', required: true },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      contract: { fields: [
        { name: 'contractNumber', type: 'string', required: true },
        { name: 'status', type: 'select:draft,sent,signed,active,expired,terminated', required: true },
        { name: 'monthlyRent', type: 'number', required: true },
        { name: 'depositAmount', type: 'number', required: false },
        { name: 'startDate', type: 'date', required: true },
        { name: 'endDate', type: 'date', required: true },
      ]},
      invoice: { fields: [
        { name: 'invoiceNumber', type: 'string', required: true },
        { name: 'amount', type: 'number', required: true },
        { name: 'totalAmount', type: 'number', required: true },
        { name: 'status', type: 'select:pending,paid,overdue,cancelled', required: true },
        { name: 'dueDate', type: 'date', required: true },
      ]},
      client: { fields: [
        { name: 'companyName', type: 'string', required: true },
        { name: 'inn', type: 'string', required: false },
        { name: 'contactName', type: 'string', required: true },
        { name: 'contactEmail', type: 'string', required: true },
        { name: 'contactPhone', type: 'string', required: false },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      supportTicket: { fields: [
        { name: 'subject', type: 'string', required: true },
        { name: 'status', type: 'select:open,in_progress,resolved,closed', required: true },
        { name: 'priority', type: 'select:low,medium,high,critical', required: false },
        { name: 'category', type: 'select:billing,technical,access,other', required: false },
        { name: 'tenantId', type: 'number', required: true },
        { name: 'userId', type: 'number', required: true },
      ]},
      payment: { fields: [
        { name: 'amount', type: 'number', required: true },
        { name: 'status', type: 'select:pending,succeeded,failed,refunded', required: true },
        { name: 'provider', type: 'string', required: false },
        { name: 'externalId', type: 'string', required: false },
        { name: 'tenantId', type: 'number', required: true },
        { name: 'invoiceId', type: 'number', required: false },
      ]},
      application: { fields: [
        { name: 'status', type: 'select:draft,submitted,under_review,approved,rejected,contract_sent,signed,active,terminated', required: true },
        { name: 'desiredStart', type: 'date', required: true },
        { name: 'desiredEnd', type: 'date', required: true },
        { name: 'desiredPrice', type: 'number', required: false },
        { name: 'comment', type: 'string', required: false },
        { name: 'rejectionReason', type: 'string', required: false },
        { name: 'clientId', type: 'number', required: true },
        { name: 'unitId', type: 'number', required: true },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      accessCard: { fields: [
        { name: 'cardNumber', type: 'string', required: true },
        { name: 'holderName', type: 'string', required: false },
        { name: 'isActive', type: 'boolean', required: false },
        { name: 'zones', type: 'string', required: false },
        { name: 'blockedReason', type: 'string', required: false },
        { name: 'clientId', type: 'number', required: true },
        { name: 'contractId', type: 'number', required: false },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      maintenanceRequest: { fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'status', type: 'select:new,open,in_progress,completed,cancelled', required: true },
        { name: 'priority', type: 'select:low,medium,high', required: false },
        { name: 'unitId', type: 'number', required: true },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      notification: { fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'message', type: 'string', required: true },
        { name: 'type', type: 'select:system,invoice,contract,maintenance,access,payment', required: false },
        { name: 'isRead', type: 'boolean', required: false },
        { name: 'userId', type: 'number', required: true },
        { name: 'tenantId', type: 'number', required: true },
      ]},
      auditLog: { fields: [
        { name: 'action', type: 'select:create,update,delete', required: true },
        { name: 'entityType', type: 'string', required: true },
        { name: 'entityId', type: 'number', required: false },
        { name: 'ipAddress', type: 'string', required: false },
        { name: 'tenantId', type: 'number', required: true },
        { name: 'userId', type: 'number', required: false },
      ]},
    };
    return schemas[model] || { fields: [] };
  }

  /** Список доступных моделей */
  getAvailableModels() {
    return [
      { key: 'tenant', label: 'Организации', icon: 'bank' },
      { key: 'user', label: 'Пользователи', icon: 'team' },
      { key: 'property', label: 'Объекты', icon: 'home' },
      { key: 'unit', label: 'Помещения', icon: 'appstore' },
      { key: 'client', label: 'Контрагенты', icon: 'contacts' },
      { key: 'contract', label: 'Договоры', icon: 'file-text' },
      { key: 'invoice', label: 'Счета', icon: 'dollar' },
      { key: 'payment', label: 'Платежи', icon: 'credit-card' },
      { key: 'application', label: 'Заявки', icon: 'form' },
      { key: 'supportTicket', label: 'Тикеты', icon: 'question-circle' },
      { key: 'accessCard', label: 'Карты доступа', icon: 'key' },
      { key: 'maintenanceRequest', label: 'Обслуживание', icon: 'tool' },
      { key: 'notification', label: 'Уведомления', icon: 'bell' },
      { key: 'auditLog', label: 'Аудит-лог', icon: 'audit' },
    ];
  }

  private buildSearchWhere(model: string, search: string): any {
    const searchFields: Record<string, string[]> = {
      tenant: ['name', 'slug', 'contactEmail', 'inn'],
      user: ['email', 'fullName'],
      property: ['name', 'address', 'city'],
      unit: ['unitNumber'],
      client: ['companyName', 'inn', 'contactName', 'contactEmail'],
      contract: ['contractNumber'],
      invoice: ['invoiceNumber'],
      supportTicket: ['subject'],
      accessCard: ['cardNumber', 'holderName'],
    };
    const fields = searchFields[model];
    if (!fields) return {};
    return { OR: fields.map((f) => ({ [f]: { contains: search, mode: 'insensitive' } })) };
  }

  private getModelIncludes(model: string): any {
    const includes: Record<string, any> = {
      user: { tenant: { select: { name: true } } },
      property: { tenant: { select: { name: true } } },
      unit: { property: { select: { name: true } }, tenant: { select: { name: true } } },
      client: { tenant: { select: { name: true } } },
      contract: { client: { select: { companyName: true } }, unit: { select: { unitNumber: true } }, tenant: { select: { name: true } } },
      invoice: { contract: { select: { contractNumber: true, client: { select: { companyName: true } } } }, tenant: { select: { name: true } } },
      application: { client: { select: { companyName: true } }, unit: { select: { unitNumber: true } }, tenant: { select: { name: true } } },
      supportTicket: { user: { select: { fullName: true, email: true } }, tenant: { select: { name: true } } },
      accessCard: { client: { select: { companyName: true } }, tenant: { select: { name: true } } },
      maintenanceRequest: { unit: { select: { unitNumber: true } }, tenant: { select: { name: true } } },
      payment: { tenant: { select: { name: true } }, invoice: { select: { invoiceNumber: true } } },
    };
    return includes[model] || {};
  }

  private cleanUpdateData(data: Record<string, any>) {
    const skip = ['id', 'createdAt', 'updatedAt', 'tenant', 'client', 'unit', 'property', 'contract', 'user', 'invoice', '_count', 'messages', 'invoices', 'contracts', 'units', 'accessCards', 'applications'];
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (skip.includes(k) || typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)) continue;
      cleaned[k] = v;
    }
    return cleaned;
  }

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
