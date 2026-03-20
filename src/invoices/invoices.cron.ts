import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailerService } from '../mailer/mailer.service';
import { EdoService } from '../contracts/edo.service';

@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
    private readonly edo: EdoService,
  ) {}

  /** Генерирует ежемесячные счета по активным договорам */
  @Cron('0 3 * * *')
  async generateMonthlyInvoices() {
    const today = new Date();
    const dayOfMonth = today.getDate();

    const contracts = await this.prisma.contract.findMany({
      where: { status: 'active', paymentDay: dayOfMonth },
      include: { tenant: { select: { slug: true } } },
    });

    let generated = 0;
    for (const contract of contracts) {
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
      generated++;
    }

    if (generated > 0) this.logger.log(`Сгенерировано счетов: ${generated}`);
  }

  /** Переводит просроченные счета в статус overdue и блокирует СКУД */
  @Cron('0 9 * * *')
  async checkOverdueInvoices() {
    const now = new Date();
    const gracePeriod = new Date();
    gracePeriod.setDate(gracePeriod.getDate() - 3);

    const overdue = await this.prisma.invoice.updateMany({
      where: { status: 'pending', dueDate: { lt: now } },
      data: { status: 'overdue' },
    });
    if (overdue.count > 0)
      this.logger.warn(`Просрочено счетов: ${overdue.count}`);

    // Блокировка СКУД при просрочке свыше grace period
    const critical = await this.prisma.invoice.findMany({
      where: { status: 'overdue', dueDate: { lt: gracePeriod } },
      select: { contractId: true, invoiceNumber: true },
    });

    for (const inv of critical) {
      await this.prisma.accessCard.updateMany({
        where: { contractId: inv.contractId, isActive: true },
        data: {
          isActive: false,
          blockedReason: `Просрочка: ${inv.invoiceNumber}`,
          blockedAt: new Date(),
        },
      });
    }
    if (critical.length > 0)
      this.logger.warn(`СКУД заблокирован: ${critical.length} договоров`);
  }

  /** Отправляет напоминания об оплате за 3 дня до срока */
  @Cron('0 10 * * *')
  async sendPaymentReminders() {
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = await this.prisma.invoice.findMany({
      where: {
        status: 'pending',
        dueDate: { gte: today, lte: threeDaysLater },
      },
      include: { contract: { include: { client: true } } },
    });

    for (const invoice of upcoming) {
      const email = invoice.contract?.client?.contactEmail;
      if (email) {
        await this.mailer.send(
          email,
          `Напоминание об оплате счёта ${invoice.invoiceNumber}`,
          'invoice',
          {
            invoiceNumber: invoice.invoiceNumber,
            amount: Number(invoice.totalAmount).toLocaleString('ru-RU'),
            dueDate: invoice.dueDate.toLocaleDateString('ru-RU'),
            unitNumber: '',
            propertyName: '',
          },
        );
      }
      this.logger.log(
        `Напоминание: счёт ${invoice.invoiceNumber} — оплата до ${invoice.dueDate.toLocaleDateString('ru-RU')}`,
      );
    }

    if (upcoming.length > 0)
      this.logger.log(`Отправлено напоминаний: ${upcoming.length}`);
  }

  /** Проверяет статусы документов в ЭДО */
  @Cron('*/30 * * * *')
  async checkEdoStatuses() {
    const { checked, updated } = await this.edo.checkAllPendingStatuses();
    if (checked > 0) {
      this.logger.log(`ЭДО: проверено ${checked}, обновлено ${updated}`);
    }
  }

  /** Завершает истёкшие договоры и освобождает помещения */
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
    if (expired.length > 0)
      this.logger.log(`Истекло договоров: ${expired.length}`);
  }

  /** Удаляет записи аудита старше года */
  @Cron('0 2 * * *')
  async cleanupAuditLog() {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const deleted = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: yearAgo } },
    });
    if (deleted.count > 0)
      this.logger.log(`Удалено записей аудита: ${deleted.count}`);
  }

  /** Инвалидирует кэш аналитики для пересчёта */
  @Cron('0 4 * * *')
  async refreshAnalyticsCache() {
    await this.redis.delByPattern('analytics:*');
    await this.redis.delByPattern('platform:*');
    this.logger.log('Кэш аналитики инвалидирован');
  }
}
