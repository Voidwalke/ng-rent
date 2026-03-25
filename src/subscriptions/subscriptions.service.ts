import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPlan } from '@prisma/client';
import {
  PaymentProvider,
  YookassaProvider,
  MockYookassaProvider,
} from '../payments/yookassa.provider';

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
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly paymentProvider: PaymentProvider;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const shopId = this.config.get<string>('YOOKASSA_SHOP_ID');
    this.paymentProvider = shopId
      ? new YookassaProvider(config)
      : new MockYookassaProvider();
  }

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

  /** Создаёт платёж для оплаты подписки (первый месяц или текущий счёт) */
  async payInvoice(tenantId: number, invoiceId?: number) {
    // Находим неоплаченный счёт подписки
    const where: any = {
      tenantId,
      status: 'pending',
    };
    if (invoiceId) where.id = invoiceId;

    const invoice = await this.prisma.subscriptionInvoice.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      include: { subscription: true },
    });

    if (!invoice) {
      throw new NotFoundException('Неоплаченный счёт подписки не найден');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { where: { role: 'admin' }, take: 1 } },
    });

    const adminEmail = tenant?.users?.[0]?.email || '';
    const amount = Number(invoice.amount);

    const result = await this.paymentProvider.createPayment(
      amount,
      'RUB',
      `Оплата подписки (${invoice.subscription.plan}) — период ${invoice.periodStart.toLocaleDateString('ru-RU')}–${invoice.periodEnd.toLocaleDateString('ru-RU')}`,
      {
        type: 'subscription',
        subscriptionInvoiceId: invoice.id,
        subscriptionId: invoice.subscriptionId,
        tenantId,
        email: adminEmail,
      },
    );

    this.logger.log(
      `Платёж подписки создан: tenant=${tenantId}, invoice=${invoice.id}, externalId=${result.id}`,
    );

    return {
      invoiceId: invoice.id,
      amount,
      confirmationUrl: result.confirmationUrl,
      externalPaymentId: result.id,
    };
  }

  /** Обрабатывает успешную оплату подписки (вызывается из вебхука платежей) */
  async handlePaymentSuccess(subscriptionInvoiceId: number) {
    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: subscriptionInvoiceId },
      include: { subscription: true },
    });

    if (!invoice || invoice.status === 'paid') return;

    await this.prisma.$transaction(async (tx: any) => {
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: 'paid', paidAt: new Date() },
      });

      // Если подписка в trialing — активируем
      if (invoice.subscription.status === 'trialing') {
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: { status: 'active' },
        });
      }

      // Если подписка past_due — восстанавливаем
      if (invoice.subscription.status === 'past_due') {
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: { status: 'active' },
        });
        await tx.tenant.update({
          where: { id: invoice.tenantId },
          data: { isActive: true },
        });
      }
    });

    this.logger.log(
      `Подписка ${invoice.subscriptionId} оплачена и активирована`,
    );
  }
}
