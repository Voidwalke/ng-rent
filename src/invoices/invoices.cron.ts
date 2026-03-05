import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(private readonly prisma: PrismaService) {}

  // Генерация ежемесячных счетов (03:00)
  @Cron('0 3 * * *')
  async generateMonthlyInvoices() {
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Контракты, у которых payment_day совпадает с сегодня
    const contracts = await this.prisma.contract.findMany({
      where: {
        status: 'active',
        paymentDay: dayOfMonth,
      },
      include: { tenant: { select: { slug: true } } },
    });

    for (const contract of contracts) {
      // Проверяем нет ли уже счёта за этот месяц
      const existingInvoice = await this.prisma.invoice.findFirst({
        where: {
          contractId: contract.id,
          periodStart: {
            gte: new Date(today.getFullYear(), today.getMonth(), 1),
          },
        },
      });
      if (existingInvoice) continue;

      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const amount = contract.monthlyRent;
      const vatAmount = Number(amount) * 0.2;
      const totalAmount = Number(amount) + vatAmount;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      // Номер: slug-202603-0001
      const seq =
        (await this.prisma.invoice.count({
          where: { contractId: contract.id },
        })) + 1;
      const invoiceNumber = `${contract.tenant.slug}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;

      await this.prisma.invoice.create({
        data: {
          tenantId: contract.tenantId,
          contractId: contract.id,
          invoiceNumber,
          periodStart,
          periodEnd,
          amount,
          vatAmount,
          totalAmount,
          dueDate,
        },
      });
    }

    if (contracts.length > 0) {
      this.logger.log(`Сгенерировано счетов: ${contracts.length}`);
    }
  }

  // Проверка просроченных (09:00)
  @Cron('0 9 * * *')
  async checkOverdueInvoices() {
    const now = new Date();
    const gracePeriod = new Date();
    gracePeriod.setDate(gracePeriod.getDate() - 3);

    // Помечаем просроченные
    const overdue = await this.prisma.invoice.updateMany({
      where: { status: 'pending', dueDate: { lt: now } },
      data: { status: 'overdue' },
    });

    if (overdue.count > 0) {
      this.logger.warn(`Просрочено счетов: ${overdue.count}`);
    }

    // Блокируем СКУД если просрочка больше grace period
    const critical = await this.prisma.invoice.findMany({
      where: { status: 'overdue', dueDate: { lt: gracePeriod } },
      select: { contractId: true, invoiceNumber: true },
    });

    for (const inv of critical) {
      await this.prisma.accessCard.updateMany({
        where: { contractId: inv.contractId, isActive: true },
        data: {
          isActive: false,
          blockedReason: `Просрочка оплаты: ${inv.invoiceNumber}`,
          blockedAt: new Date(),
        },
      });
    }

    if (critical.length > 0) {
      this.logger.warn(`Заблокирован СКУД: ${critical.length} договоров`);
    }
  }

  // Проверка истёкших договоров (00:00)
  @Cron('0 0 * * *')
  async checkExpiredContracts() {
    const now = new Date();

    const expired = await this.prisma.contract.findMany({
      where: { status: 'active', endDate: { lt: now } },
    });

    for (const contract of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: 'expired' },
        });
        await tx.unit.update({
          where: { id: contract.unitId },
          data: { status: 'available' },
        });
        await tx.accessCard.updateMany({
          where: { contractId: contract.id, isActive: true },
          data: {
            isActive: false,
            blockedReason: 'Договор истёк',
            blockedAt: now,
          },
        });
      });
    }

    if (expired.length > 0) {
      this.logger.log(`Истекло договоров: ${expired.length}`);
    }
  }

  // Очистка старых записей аудита (02:00)
  @Cron('0 2 * * *')
  async cleanupAuditLog() {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    const deleted = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: yearAgo } },
    });

    if (deleted.count > 0) {
      this.logger.log(`Удалено записей аудита: ${deleted.count}`);
    }
  }
}
