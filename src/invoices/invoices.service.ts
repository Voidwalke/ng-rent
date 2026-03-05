import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number, status?: string) {
    const where: any = { tenantId };
    if (status) where.status = status;

    return this.prisma.invoice.findMany({
      where,
      include: {
        contract: {
          select: {
            contractNumber: true,
            application: {
              select: { client: { select: { companyName: true } } },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        contract: { include: { application: { include: { client: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    return invoice;
  }

  // Оплата счёта
  async pay(id: number) {
    const invoice = await this.findOne(id);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
    });

    // Если был просрочен — разблокируем СКУД
    if (invoice.status === 'overdue') {
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

    return updated;
  }
}
