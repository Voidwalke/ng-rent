import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreditNoteDto } from './dto/credit-note.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidAmount: paidAmount || invoice.totalAmount,
        paymentReference,
      },
    });

    // При оплате просроченного счёта проверяем остальные просрочки по договору
    if (invoice.status === 'overdue') {
      const otherOverdue = await this.prisma.invoice.count({
        where: {
          contractId: invoice.contractId,
          status: 'overdue',
          id: { not: id },
        },
      });

      if (otherOverdue === 0) {
        await this.prisma.accessCard.updateMany({
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

    return updated;
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

  /** Создаёт ручной счёт */
  async createManual(tenantId: number, data: CreateInvoiceDto) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: data.contractId, tenantId },
    });
    if (!contract) throw new NotFoundException('Договор не найден');

    const count = await this.prisma.invoice.count({
      where: { contractId: data.contractId },
    });

    const vatRate = 0.2;
    const vatAmount = data.amount * vatRate;
    const totalAmount = data.amount + vatAmount;

    return this.prisma.invoice.create({
      data: {
        tenantId,
        contractId: data.contractId,
        invoiceNumber: `INV-${contract.contractNumber}-${String(count + 1).padStart(3, '0')}`,
        amount: data.amount,
        vatAmount,
        totalAmount,
        dueDate: new Date(data.dueDate),
        periodStart: data.periodStart ? new Date(data.periodStart) : null,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
      },
    });
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

    return this.prisma.invoice.create({
      data: {
        tenantId,
        contractId: original.contractId,
        invoiceNumber: `CN-${original.invoiceNumber}-${String(count + 1).padStart(3, '0')}`,
        amount: -data.amount,
        vatAmount: -(data.amount * 0.2),
        totalAmount: -(data.amount * 1.2),
        dueDate: new Date(),
        status: 'paid',
        paidAt: new Date(),
      },
    });
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
