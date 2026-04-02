import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreditNoteDto } from './dto/credit-note.dto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /** Возвращает список счетов тенанта с фильтрацией */
  async findAll(
    tenantId: number,
    filters?: {
      status?: string;
      contractId?: number;
      page?: number;
      limit?: number;
    },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.contractId) where.contractId = filters.contractId;

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          contract: {
            select: {
              contractNumber: true,
              client: { select: { companyName: true } },
            },
          },
        },
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Возвращает счёт по идентификатору */
  async findOne(id: number, tenantId?: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...(tenantId && { tenantId }) },
      include: {
        contract: {
          include: {
            client: true,
            unit: { include: { property: true } },
          },
        },
        payments: true,
      },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    return invoice;
  }

  /** Подтверждает оплату счёта */
  async pay(
    id: number,
    paidAmount?: number,
    paymentReference?: string,
    tenantId?: number,
  ) {
    const invoice = await this.findOne(id, tenantId);
    if (invoice.status === 'paid') {
      throw new BadRequestException('Счёт уже оплачен');
    }
    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Нельзя оплатить отменённый счёт');
    }

    const total = Number(invoice.totalAmount);
    const alreadyPaid = Number(invoice.paidAmount) || 0;
    const effectiveAmount = paidAmount ?? total;
    if (effectiveAmount > total - alreadyPaid) {
      throw new BadRequestException(
        `Сумма оплаты (${effectiveAmount}) превышает остаток по счёту (${total - alreadyPaid})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const newPaidAmount =
        (paidAmount ?? Number(invoice.totalAmount)) + alreadyPaid;
      const isFullyPaid = newPaidAmount >= total;

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: isFullyPaid ? 'paid' : 'pending',
          paidAt: isFullyPaid ? new Date() : null,
          paidAmount: newPaidAmount,
          paymentReference,
        },
      });

      // При оплате просроченного счёта проверяем остальные просрочки по договору
      if (invoice.status === 'overdue') {
        const otherOverdue = await tx.invoice.count({
          where: {
            contractId: invoice.contractId,
            status: 'overdue',
            id: { not: id },
          },
        });

        if (otherOverdue === 0) {
          await tx.accessCard.updateMany({
            where: {
              contractId: invoice.contractId,
              isActive: false,
              blockedReason: { contains: 'Просрочка' },
            },
            data: {
              isActive: true,
              blockedReason: null,
              blockedAt: null,
              activatedAt: new Date(),
            },
          });
        }
      }

      // Если оплачен депозитный счёт — обновляем статус депозита в договоре
      if (isFullyPaid && invoice.invoiceNumber?.startsWith('DEP-') && !invoice.invoiceNumber?.startsWith('DEP-RETURN')) {
        await tx.contract.updateMany({
          where: { id: invoice.contractId, depositStatus: 'pending' },
          data: { depositStatus: 'paid' },
        });
      }

      return updated;
    });
  }

  /** Отменяет неоплаченный счёт */
  async cancel(id: number, tenantId?: number) {
    const invoice = await this.findOne(id, tenantId);
    if (!['pending', 'overdue'].includes(invoice.status)) {
      throw new BadRequestException('Можно отменить только неоплаченный счёт');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  /** Получает ставку НДС для тенанта (null → 20%, 0 → без НДС) */
  private async getVatRate(tenantId: number): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { vatRate: true },
    });
    if (tenant?.vatRate !== null && tenant?.vatRate !== undefined) {
      return Number(tenant.vatRate) / 100; // stored as percent, e.g. 20.00
    }
    return 0.2; // default 20%
  }

  /** Создаёт ручной счёт */
  async createManual(tenantId: number, data: CreateInvoiceDto) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: data.contractId, tenantId },
      include: {
        client: { select: { contactEmail: true } },
        unit: {
          select: {
            unitNumber: true,
            property: { select: { name: true } },
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Договор не найден');

    const count = await this.prisma.invoice.count({
      where: { contractId: data.contractId },
    });

    const vatRate = await this.getVatRate(tenantId);
    const vatAmount = Math.round(data.amount * vatRate * 100) / 100;
    const totalAmount = Math.round((data.amount + vatAmount) * 100) / 100;
    const invoiceNumber = `INV-${contract.contractNumber}-${String(count + 1).padStart(3, '0')}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        contractId: data.contractId,
        invoiceNumber,
        amount: data.amount,
        vatAmount,
        totalAmount,
        dueDate: new Date(data.dueDate),
        periodStart: data.periodStart ? new Date(data.periodStart) : null,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
      },
    });

    // Email клиенту о новом счёте
    try {
      const email = contract.client?.contactEmail;
      if (email) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
        });

        await this.mailer.send(
          email,
          `Выставлен счёт ${invoiceNumber}`,
          'invoice',
          {
            invoiceNumber,
            amount: totalAmount.toLocaleString('ru-RU'),
            vatAmount: vatAmount > 0
              ? vatAmount.toLocaleString('ru-RU')
              : null,
            dueDate: new Date(data.dueDate).toLocaleDateString('ru-RU'),
            unitNumber: contract.unit?.unitNumber || '',
            propertyName: contract.unit?.property?.name || '',
            landlordName: tenant?.name || '',
            landlordInn: tenant?.inn || '',
            landlordKpp: tenant?.kpp || '',
            landlordBankAccount: (tenant as any)?.bankAccount || '',
            landlordBankName: (tenant as any)?.bankName || '',
            landlordBik: (tenant as any)?.bik || '',
            landlordCorrAccount: (tenant as any)?.corrAccount || '',
            payUrl: '',
          },
        );
      }
    } catch (err: any) {
      this.logger.error(`Ошибка отправки email (invoice ${invoiceNumber}): ${err.message}`);
    }

    return invoice;
  }

  /** Создаёт кредит-ноту (счёт с отрицательной суммой) */
  async createCreditNote(tenantId: number, data: CreditNoteDto) {
    const original = await this.findOne(data.invoiceId, tenantId);
    if (data.amount > Number(original.totalAmount)) {
      throw new BadRequestException('Сумма возврата превышает сумму счёта');
    }

    const count = await this.prisma.invoice.count({
      where: { contractId: original.contractId },
    });

    // Пропорция НДС из оригинального счёта (может быть 0% для депозитов)
    const origAmount = Number(original.amount);
    const origVat = Number(original.vatAmount);
    const vatRate = origAmount > 0 ? origVat / origAmount : 0;
    const creditVat = Math.round(data.amount * vatRate * 100) / 100;

    return this.prisma.invoice.create({
      data: {
        tenantId,
        contractId: original.contractId,
        invoiceNumber: `CN-${original.invoiceNumber}-${String(count + 1).padStart(3, '0')}`,
        amount: -data.amount,
        vatAmount: -creditVat,
        totalAmount: -(data.amount + creditVat),
        dueDate: new Date(),
        status: 'paid',
        paidAt: new Date(),
      },
    });
  }

  /** Массово создаёт счета по списку договоров */
  async generateBatch(tenantId: number, contractIds: number[]) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        id: { in: contractIds },
        tenantId,
        status: { in: ['signed', 'active'] },
      },
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Проверка, нет ли уже счетов за текущий период
    const existing = await this.prisma.invoice.findMany({
      where: {
        contractId: { in: contracts.map((c) => c.id) },
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
      select: { contractId: true },
    });
    const existingContractIds = new Set(existing.map((e) => e.contractId));

    const vatRate = await this.getVatRate(tenantId);
    const results: any[] = [];
    const skipped: number[] = [];

    for (const contract of contracts) {
      if (existingContractIds.has(contract.id)) {
        skipped.push(contract.id);
        continue;
      }

      const count = await this.prisma.invoice.count({
        where: { contractId: contract.id },
      });
      const amount = Number(contract.monthlyRent);
      const vatAmount = Math.round(amount * vatRate * 100) / 100;
      const totalAmount = Math.round((amount + vatAmount) * 100) / 100;
      const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);

      const invoice = await this.prisma.invoice.create({
        data: {
          tenantId,
          contractId: contract.id,
          invoiceNumber: `INV-${contract.contractNumber}-${String(count + 1).padStart(3, '0')}`,
          amount,
          vatAmount,
          totalAmount,
          dueDate,
          periodStart,
          periodEnd,
        },
      });
      results.push(invoice);
    }

    return { generated: results.length, skipped: skipped.length, invoices: results };
  }

  /** Возвращает агрегированную сводку по счетам */
  async getSummary(tenantId: number) {
    const [pending, overdue, paidThisMonth] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'pending' },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'overdue' },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: 'paid',
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
    ]);

    return {
      totalPending: Number(pending._sum.totalAmount) || 0,
      pendingCount: pending._count,
      totalOverdue: Number(overdue._sum.totalAmount) || 0,
      overdueCount: overdue._count,
      paidThisMonth: Number(paidThisMonth._sum.totalAmount) || 0,
      paidThisMonthCount: paidThisMonth._count,
    };
  }
}
