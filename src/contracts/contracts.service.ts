import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список договоров с фильтрацией и пагинацией */
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

  /** Возвращает договор по идентификатору */
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

  /** Проверяет, нет ли пересечения аренды на помещение (принимает tx для атомарности) */
  private async checkUnitOverlap(
    client: Pick<PrismaService, 'contract'>,
    unitId: number,
    startDate: Date,
    endDate: Date,
    excludeContractId?: number,
  ) {
    const where: any = {
      unitId,
      status: { in: ['draft', 'sent', 'signed', 'active'] },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    };
    if (excludeContractId) where.id = { not: excludeContractId };

    const overlap = await client.contract.findFirst({ where });
    if (overlap) {
      throw new BadRequestException(
        `Помещение уже занято по договору ${overlap.contractNumber} (${overlap.startDate.toISOString().slice(0, 10)} — ${overlap.endDate.toISOString().slice(0, 10)})`,
      );
    }
  }

  /** Генерирует договор на основе одобренной заявки */
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
      // Защита от двойной аренды (внутри транзакции для атомарности)
      await this.checkUnitOverlap(tx, app.unitId, app.desiredStart, app.desiredEnd);

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

  /** Подписывает договор, создаёт первый счёт, депозит и карту СКУД */
  async sign(id: number, tenantId?: number) {
    const contract = await this.findOne(id, tenantId);
    if (contract.status !== 'draft' && contract.status !== 'sent') {
      throw new BadRequestException(
        'Договор нельзя подписать в текущем статусе',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Проверяем, что помещение не занято другим договором (защита от race condition)
      await this.checkUnitOverlap(tx, contract.unitId, contract.startDate, contract.endDate, id);

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
      const vatAmount = Math.round(Number(amount) * vatRate * 100) / 100;
      const totalAmount = Math.round((Number(amount) + vatAmount) * 100) / 100;
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

      // Счёт на обеспечительный депозит (если указан)
      const depositAmount = contract.depositAmount ? Number(contract.depositAmount) : 0;
      if (depositAmount > 0) {
        await tx.invoice.create({
          data: {
            tenantId: contract.tenantId,
            contractId: id,
            invoiceNumber: `DEP-${contract.contractNumber}-001`,
            amount: depositAmount,
            vatAmount: 0,
            totalAmount: depositAmount,
            dueDate,
            periodStart: contract.startDate,
            periodEnd: contract.endDate,
          },
        });
      }

      // Карта СКУД
      await tx.accessCard.create({
        data: {
          tenantId: contract.tenantId,
          clientId: contract.clientId,
          contractId: id,
          cardNumber: `CARD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          holderName: contract.client?.contactName,
          activatedAt: new Date(),
          expiresAt: contract.endDate,
        },
      });

      return updated;
    });
  }

  /** Активирует подписанный договор */
  async activate(id: number, tenantId?: number) {
    const contract = await this.findOne(id, tenantId);
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

  /** Возвращает договоры с истекающим сроком (за N дней) */
  async findExpiring(tenantId: number, days = 30) {
    const now = new Date();
    const deadline = new Date();
    deadline.setDate(now.getDate() + days);

    return this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: ['signed', 'active'] },
        endDate: { gte: now, lte: deadline },
      },
      include: {
        client: { select: { companyName: true, contactName: true, contactEmail: true } },
        unit: { select: { unitNumber: true, floor: true, areaSqm: true, property: { select: { name: true } } } },
      },
      orderBy: { endDate: 'asc' },
    });
  }

  /** Продлевает договор — создаёт новый на основе старого */
  async renew(id: number, tenantId: number, data: { newEndDate: string; newMonthlyRent?: number }) {
    const contract = await this.findOne(id, tenantId);
    if (!['signed', 'active'].includes(contract.status)) {
      throw new BadRequestException('Продлить можно только активный/подписанный договор');
    }

    return this.prisma.$transaction(async (tx) => {
      // Проверяем overlap для нового периода (исключая текущий договор)
      await this.checkUnitOverlap(tx, contract.unitId, contract.endDate, new Date(data.newEndDate), id);

      // Завершаем текущий
      await tx.contract.update({
        where: { id },
        data: { status: 'expired' },
      });

      // Новый номер
      const now = new Date();
      const prefix = `D-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const count = await tx.contract.count({
        where: { contractNumber: { startsWith: prefix } },
      });
      const contractNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`;

      return tx.contract.create({
        data: {
          tenantId,
          applicationId: contract.applicationId,
          clientId: contract.clientId,
          unitId: contract.unitId,
          contractNumber,
          startDate: contract.endDate,
          endDate: new Date(data.newEndDate),
          monthlyRent: data.newMonthlyRent ?? contract.monthlyRent,
          status: 'signed',
          signedAt: new Date(),
        },
      });
    });
  }

  /** Продлевает срок действия текущего договора */
  async extend(id: number, tenantId: number, newEndDate: string) {
    const contract = await this.findOne(id, tenantId);
    if (!['signed', 'active'].includes(contract.status)) {
      throw new BadRequestException('Продлить можно только активный/подписанный договор');
    }
    if (new Date(newEndDate) <= contract.endDate) {
      throw new BadRequestException('Новая дата должна быть позже текущей');
    }

    return this.prisma.$transaction(async (tx) => {
      // Проверяем, что продление не пересекается с другими договорами
      await this.checkUnitOverlap(tx, contract.unitId, contract.endDate, new Date(newEndDate), id);

      return tx.contract.update({
        where: { id },
        data: { endDate: new Date(newEndDate) },
      });
    });
  }

  /** Расторгает договор, освобождает помещение и блокирует карты СКУД */
  async terminate(id: number, reason?: string, tenantId?: number) {
    const contract = await this.findOne(id, tenantId);
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

      // Обновляем статус заявки
      if (contract.applicationId) {
        await tx.application.update({
          where: { id: contract.applicationId },
          data: { status: 'rejected' },
        });
      }

      // Отменяем неоплаченные счета
      await tx.invoice.updateMany({
        where: { contractId: id, status: { in: ['pending', 'overdue'] } },
        data: { status: 'cancelled' },
      });

      // Кредит-ноты для оплаченных счетов за будущие периоды
      const now = new Date();
      const paidFutureInvoices = await tx.invoice.findMany({
        where: {
          contractId: id,
          status: 'paid',
          periodStart: { gt: now },
          invoiceNumber: { not: { startsWith: 'DEP-' } },
        },
      });
      for (const inv of paidFutureInvoices) {
        const invCount = await tx.invoice.count({ where: { contractId: id } });
        await tx.invoice.create({
          data: {
            tenantId: contract.tenantId,
            contractId: id,
            invoiceNumber: `CN-${inv.invoiceNumber}-${String(invCount + 1).padStart(3, '0')}`,
            amount: -Number(inv.amount),
            vatAmount: -Number(inv.vatAmount),
            totalAmount: -Number(inv.totalAmount),
            dueDate: new Date(Date.now() + 10 * 86400000),
            status: 'paid',
            paidAt: new Date(),
          },
        });
      }

      // Возврат обеспечительного депозита — создаём кредит-ноту
      const depositAmount = contract.depositAmount ? Number(contract.depositAmount) : 0;
      if (depositAmount > 0) {
        // Проверяем, был ли оплачен депозит
        const depositInvoice = await tx.invoice.findFirst({
          where: {
            contractId: id,
            invoiceNumber: { startsWith: 'DEP-' },
            status: 'paid',
          },
        });
        if (depositInvoice) {
          const invCount = await tx.invoice.count({ where: { contractId: id } });
          await tx.invoice.create({
            data: {
              tenantId: contract.tenantId,
              contractId: id,
              invoiceNumber: `DEP-RETURN-${contract.contractNumber}-${String(invCount + 1).padStart(3, '0')}`,
              amount: -depositAmount,
              vatAmount: 0,
              totalAmount: -depositAmount,
              dueDate: new Date(Date.now() + 10 * 86400000), // 10 рабочих дней
              status: 'paid',
              paidAt: new Date(),
            },
          });
        }
      }

      return { message: 'Договор расторгнут' };
    });
  }
}
