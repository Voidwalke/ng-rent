import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number, status?: string, page = 1, limit = 50) {
    const where: any = { tenantId };
    if (status) where.status = status;
    const take = Math.min(limit, 100);

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          client: { select: { companyName: true, contactName: true } },
          unit: { select: { unitNumber: true, floor: true, areaSqm: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total, page, limit: take, pages: Math.ceil(total / take) };
  }

  async findOne(id: number, tenantId?: number) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, ...(tenantId && { tenantId }) },
      include: {
        application: true,
        client: true,
        unit: { include: { property: true } },
        invoices: { orderBy: { dueDate: 'desc' } },
        accessCards: true,
      },
    });
    if (!contract) throw new NotFoundException('Договор не найден');
    return contract;
  }

  // Генерация договора после одобрения заявки
  async generateFromApplication(applicationId: number, tenantId: number) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { unit: true, client: true },
    });
    if (!app) throw new NotFoundException('Заявка не найдена');
    if (app.status !== 'approved') {
      throw new BadRequestException(
        'Договор можно создать только по одобренной заявке',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Номер в формате D-{год}{месяц}-{порядковый}
      const now = new Date();
      const prefix = `D-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const count = await tx.contract.count({
        where: { contractNumber: { startsWith: prefix } },
      });
      const contractNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`;

      const contract = await tx.contract.create({
        data: {
          tenantId,
          applicationId,
          clientId: app.clientId,
          unitId: app.unitId,
          contractNumber,
          startDate: app.desiredStart,
          endDate: app.desiredEnd,
          monthlyRent: app.desiredPrice || app.unit.priceMonth,
          status: 'draft',
        },
      });

      // Переводим заявку в статус contract_sent
      await tx.application.update({
        where: { id: applicationId },
        data: { status: 'contract_sent' },
      });

      return contract;
    });
  }

  // Подписание — создаём первый счёт и карту СКУД
  async sign(id: number) {
    const contract = await this.findOne(id);
    if (contract.status !== 'draft' && contract.status !== 'sent') {
      throw new BadRequestException(
        'Договор нельзя подписать в текущем статусе',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id },
        data: { status: 'signed', signedAt: new Date() },
      });

      // Помещение → арендовано
      await tx.unit.update({
        where: { id: contract.unitId },
        data: { status: 'rented' },
      });

      // Заявка → signed
      await tx.application.update({
        where: { id: contract.applicationId },
        data: { status: 'signed' },
      });

      // Первый счёт с НДС
      const amount = contract.monthlyRent;
      const vatRate = 0.2;
      const vatAmount = Number(amount) * vatRate;
      const totalAmount = Number(amount) + vatAmount;
      const dueDate = new Date(contract.startDate);
      dueDate.setDate(dueDate.getDate() + 14);

      await tx.invoice.create({
        data: {
          tenantId: contract.tenantId,
          contractId: id,
          invoiceNumber: `INV-${contract.contractNumber}-001`,
          periodStart: contract.startDate,
          periodEnd: new Date(
            new Date(contract.startDate).setMonth(
              new Date(contract.startDate).getMonth() + 1,
            ),
          ),
          amount,
          vatAmount,
          totalAmount,
          dueDate,
        },
      });

      // Карта СКУД
      await tx.accessCard.create({
        data: {
          tenantId: contract.tenantId,
          clientId: contract.clientId,
          contractId: id,
          cardNumber: `CARD-${Date.now().toString(36).toUpperCase()}`,
          holderName: contract.client?.contactName,
          activatedAt: new Date(),
          expiresAt: contract.endDate,
        },
      });

      return updated;
    });
  }

  // Активация договора
  async activate(id: number) {
    const contract = await this.findOne(id);
    if (contract.status !== 'signed') {
      throw new BadRequestException(
        'Активировать можно только подписанный договор',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id },
        data: { status: 'active' },
      });

      await tx.application.update({
        where: { id: contract.applicationId },
        data: { status: 'active' },
      });

      return updated;
    });
  }

  async terminate(id: number, reason?: string) {
    const contract = await this.findOne(id);
    if (!['active', 'signed'].includes(contract.status)) {
      throw new BadRequestException(
        'Нельзя расторгнуть договор в текущем статусе',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: {
          status: 'terminated',
          terminatedAt: new Date(),
          terminationReason: reason,
        },
      });

      await tx.unit.update({
        where: { id: contract.unitId },
        data: { status: 'available' },
      });

      // Блокируем все карты СКУД
      await tx.accessCard.updateMany({
        where: { contractId: id, isActive: true },
        data: {
          isActive: false,
          blockedReason: 'Договор расторгнут',
          blockedAt: new Date(),
        },
      });

      // Отменяем неоплаченные счета
      await tx.invoice.updateMany({
        where: { contractId: id, status: { in: ['pending', 'overdue'] } },
        data: { status: 'cancelled' },
      });

      return { message: 'Договор расторгнут' };
    });
  }
}
