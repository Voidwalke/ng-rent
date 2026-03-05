import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** Интерфейс для платёжного провайдера */
interface PaymentProvider {
  createPayment(
    amount: number,
    currency: string,
    description: string,
    metadata: any,
  ): Promise<{ id: string; confirmationUrl: string }>;
  verifyWebhook(body: any, signature: string): boolean;
}

/** Мок-провайдер ЮKassa для разработки */
class MockYookassaProvider implements PaymentProvider {
  async createPayment(
    amount: number,
    _currency: string,
    description: string,
    metadata: any,
  ) {
    const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      confirmationUrl: `https://yookassa.ru/checkout/mock/${id}`,
    };
  }

  verifyWebhook(_body: any, _signature: string) {
    return true; // В проде — проверка HMAC
  }
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly provider: PaymentProvider;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    // В проде подключаем реальный SDK ЮKassa
    this.provider = new MockYookassaProvider();
  }

  /** Создать платёж по счёту */
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

    const payableAmount =
      Number(invoice.totalAmount) - Number(invoice.paidAmount || 0);

    const result = await this.provider.createPayment(
      payableAmount,
      'RUB',
      `Оплата счёта ${invoice.invoiceNumber}`,
      { invoiceId: invoice.id, tenantId },
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

  /** Обработка вебхука от ЮKassa */
  async handleWebhook(body: any, signature: string) {
    if (!this.provider.verifyWebhook(body, signature)) {
      throw new BadRequestException('Невалидная подпись вебхука');
    }

    const event = body.event;
    const paymentData = body.object;

    const payment = await this.prisma.payment.findFirst({
      where: { externalId: paymentData.id },
    });

    if (!payment) {
      this.logger.warn(`Платёж с externalId=${paymentData.id} не найден`);
      return { status: 'ignored' };
    }

    if (event === 'payment.succeeded') {
      await this.prisma.$transaction(async (tx) => {
        // Обновляем платёж
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

        // Обновляем счёт
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
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'canceled',
          webhookData: paymentData,
          completedAt: new Date(),
        },
      });
    }

    return { status: 'ok' };
  }

  /** Список платежей по счёту */
  async findByInvoice(tenantId: number, invoiceId: number) {
    return this.prisma.payment.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Все платежи тенанта с пагинацией */
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
}
