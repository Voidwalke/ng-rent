import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список счетов тенанта с фильтрацией */
  async findAll(
    tenantId: number,
    filters?: { status?: string; contractId?: number },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.contractId) where.contractId = filters.contractId;

    return this.prisma.invoice.findMany({
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
    });
  }

  /** Возвращает счёт по идентификатору */
  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
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
  async pay(id: number, paidAmount?: number, paymentReference?: string) {
    const invoice = await this.findOne(id);
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
  async cancel(id: number) {
    const invoice = await this.findOne(id);
    if (!['pending', 'overdue'].includes(invoice.status)) {
      throw new BadRequestException('Можно отменить только неоплаченный счёт');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'cancelled' },
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
