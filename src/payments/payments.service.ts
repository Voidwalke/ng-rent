import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaymentProvider,
  YookassaProvider,
  MockYookassaProvider,
} from './yookassa.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly provider: PaymentProvider;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const shopId = this.config.get<string>('YOOKASSA_SHOP_ID');
    this.provider = shopId
      ? new YookassaProvider(config)
      : new MockYookassaProvider();

    this.logger.log(`Платёжный провайдер: ${shopId ? 'ЮKassa' : 'Mock'}`);
  }

  /** Создаёт платёж по счёту */
  async createPayment(tenantId: number, invoiceId: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { contract: { include: { client: true } } },
    });

    if (!invoice) throw new NotFoundException('Счёт не найден');
    if (invoice.status === 'paid')
      throw new BadRequestException('Счёт уже оплачен');
    if (invoice.status === 'cancelled')
      throw new BadRequestException('Счёт отменён');

    // H8: Идемпотентность — проверяем, нет ли уже pending-платежа
    const existingPayment = await this.prisma.payment.findFirst({
      where: { invoiceId, status: 'pending' },
    });
    if (existingPayment) {
      return {
        paymentId: existingPayment.id,
        confirmationUrl: null,
        message: 'Платёж уже создан и ожидает оплаты',
      };
    }

    const payableAmount =
      Number(invoice.totalAmount) - Number(invoice.paidAmount || 0);

    const result = await this.provider.createPayment(
      payableAmount,
      'RUB',
      `Оплата счёта ${invoice.invoiceNumber}`,
      {
        invoiceId: invoice.id,
        tenantId,
        email: invoice.contract?.client?.contactEmail,
      },
    );

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId,
        provider: 'yookassa',
        externalId: result.id,
        amount: payableAmount,
        status: 'pending',
      },
    });

    return {
      paymentId: payment.id,
      confirmationUrl: result.confirmationUrl,
    };
  }

  /** Обрабатывает вебхук от ЮKassa (верификация через IP-whitelist на nginx) */
  async handleWebhook(body: any) {
    const event = body.event;
    const paymentData = body.object;

    // H9: Дедупликация вебхуков
    const statusMap: Record<string, string> = {
      'payment.succeeded': 'succeeded',
      'payment.canceled': 'canceled',
      'refund.succeeded': 'refunded',
    };
    const expectedStatus = statusMap[event];
    if (expectedStatus) {
      const processed = await this.prisma.payment.findFirst({
        where: {
          externalId: paymentData.id,
          status: expectedStatus,
        },
      });
      if (processed) {
        return { status: 'already_processed' };
      }
    }

    // Обработка платежей по подписке (metadata.type === 'subscription')
    if (
      event === 'payment.succeeded' &&
      paymentData.metadata?.type === 'subscription'
    ) {
      const subInvoiceId = paymentData.metadata.subscriptionInvoiceId;
      if (subInvoiceId) {
        await this.handleSubscriptionPayment(Number(subInvoiceId));
        return { status: 'ok', type: 'subscription' };
      }
    }

    const payment = await this.prisma.payment.findFirst({
      where: { externalId: paymentData.id },
    });

    if (!payment) {
      this.logger.warn(`Платёж с externalId=${paymentData.id} не найден`);
      return { status: 'ignored' };
    }

    if (event === 'payment.succeeded') {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'succeeded',
            paymentMethod: paymentData.payment_method?.type || 'card',
            receiptUrl: paymentData.receipt?.url,
            webhookData: paymentData,
            completedAt: new Date(),
          },
        });

        const invoice = await tx.invoice.findUnique({
          where: { id: payment.invoiceId },
        });
        if (!invoice) return;

        const newPaidAmount =
          Number(invoice.paidAmount || 0) + Number(payment.amount);
        const totalAmount = Number(invoice.totalAmount);

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            status: newPaidAmount >= totalAmount ? 'paid' : 'pending',
            paidAt: newPaidAmount >= totalAmount ? new Date() : undefined,
          },
        });
      });

      this.logger.log(`Платёж ${payment.id} успешно обработан`);
    }

    if (event === 'payment.canceled') {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'canceled',
            webhookData: paymentData,
            completedAt: new Date(),
          },
        });
      });
    }

    if (event === 'refund.succeeded') {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'refunded', webhookData: paymentData },
        });

        const invoice = await tx.invoice.findUnique({
          where: { id: payment.invoiceId },
        });
        if (invoice) {
          const refundAmount = Number(
            paymentData.amount?.value || payment.amount,
          );
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: Math.max(
                0,
                Number(invoice.paidAmount) - refundAmount,
              ),
              status: 'cancelled',
            },
          });
        }
      });
    }

    return { status: 'ok' };
  }

  /** Возвращает платежи по счёту */
  async findByInvoice(tenantId: number, invoiceId: number) {
    return this.prisma.payment.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Выполняет возврат платежа через провайдер */
  async refund(tenantId: number, invoiceId: number, amount?: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { invoiceId, tenantId, status: 'succeeded' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) throw new NotFoundException('Успешный платёж не найден');

    if (!payment.externalId)
      throw new NotFoundException('Платёж не имеет внешнего идентификатора');

    const refundAmount = amount || Number(payment.amount);
    if (refundAmount <= 0 || refundAmount > Number(payment.amount)) {
      throw new BadRequestException(
        `Сумма возврата должна быть от 0.01 до ${String(payment.amount)} ₽`,
      );
    }
    let result: { id: string; status: string };
    try {
      result = await this.provider.createRefund(
        payment.externalId,
        refundAmount,
      );
    } catch (err: any) {
      this.logger.error(`Ошибка возврата: ${err.message}`);
      throw new BadRequestException(
        'Не удалось создать возврат в платёжной системе',
      );
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'refunding', webhookData: { refundId: result.id } },
    });

    this.logger.log(`Возврат ${refundAmount} ₽, refundId=${result.id}`);
    return {
      message: 'Возврат инициирован',
      refundId: result.id,
      amount: refundAmount,
    };
  }

  /** Возвращает все платежи тенанта с пагинацией */
  async findAll(tenantId: number, page = 1, limit = 20) {
    const where = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              contract: { select: { contractNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Обрабатывает успешную оплату подписки */
  private async handleSubscriptionPayment(subscriptionInvoiceId: number) {
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

      if (['trialing', 'past_due'].includes(invoice.subscription.status)) {
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: { status: 'active' },
        });
      }

      if (invoice.subscription.status === 'past_due') {
        await tx.tenant.update({
          where: { id: invoice.tenantId },
          data: { isActive: true },
        });
      }
    });

    this.logger.log(
      `Подписка ${invoice.subscriptionId} оплачена (invoice=${subscriptionInvoiceId})`,
    );
  }
}
