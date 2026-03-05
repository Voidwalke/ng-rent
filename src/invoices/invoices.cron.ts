import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(private readonly prisma: PrismaService) {}

  // Каждый день в 8 утра проверяем просроченные счета
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverdueInvoices() {
    const now = new Date();

    // Находим просроченные
    const overdue = await this.prisma.invoice.updateMany({
      where: {
        status: 'pending',
        dueDate: { lt: now },
      },
      data: { status: 'overdue' },
    });

    if (overdue.count > 0) {
      this.logger.warn(`Обнаружено ${overdue.count} просроченных счетов`);
    }

    // Блокируем СКУД если просрочка больше 3 дней
    const gracePeriod = new Date();
    gracePeriod.setDate(gracePeriod.getDate() - 3);

    const criticalInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'overdue',
        dueDate: { lt: gracePeriod },
      },
      select: { contractId: true, invoiceNumber: true },
    });

    for (const inv of criticalInvoices) {
      await this.prisma.accessCard.updateMany({
        where: {
          contractId: inv.contractId,
          isActive: true,
        },
        data: {
          isActive: false,
          blockedReason: `Просрочка оплаты счёта ${inv.invoiceNumber}`,
          blockedAt: new Date(),
        },
      });
    }

    if (criticalInvoices.length > 0) {
      this.logger.warn(
        `Заблокирован СКУД по ${criticalInvoices.length} договорам`,
      );
    }
  }

  // Ежемесячная генерация счетов по активным договорам
  @Cron('0 9 1 * *') // 1-е число каждого месяца в 9:00
  async generateMonthlyInvoices() {
    const activeContracts = await this.prisma.contract.findMany({
      where: { status: 'active' },
    });

    for (const contract of activeContracts) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);

      await this.prisma.invoice.create({
        data: {
          tenantId: contract.tenantId,
          contractId: contract.id,
          invoiceNumber: `INV-${contract.id}-${Date.now()}`,
          amount: contract.monthlyRent,
          dueDate,
        },
      });
    }

    this.logger.log(`Создано ${activeContracts.length} ежемесячных счетов`);
  }
}
