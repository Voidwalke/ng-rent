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

  /** Получает ставку НДС для тенанта */
  private async getVatRate(tenantId: number): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { vatRate: true },
    });
    if (tenant?.vatRate !== null && tenant?.vatRate !== undefined) {
      return Number(tenant.vatRate) / 100;
    }
    return 0.2;
  }

  /** Генерирует ежемесячные счета по активным договорам */
  @Cron('0 3 * * *')
  async generateMonthlyInvoices() {
    if (!(await this.redis.acquireLock('cron:monthly-invoices', 3600))) return;
    try {
      const today = new Date();
      const dayOfMonth = today.getDate();

      const contracts = await this.prisma.contract.findMany({
        where: { status: 'active', paymentDay: dayOfMonth },
        include: {
          tenant: true,
          client: { select: { contactEmail: true } },
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true } },
            },
          },
        },
      });

      let generated = 0;
      for (const contract of contracts) {
        try {
          const existingInvoice = await this.prisma.invoice.findFirst({
            where: {
              contractId: contract.id,
              periodStart: {
                gte: new Date(today.getFullYear(), today.getMonth(), 1),
              },
            },
          });
          if (existingInvoice) continue;

          const periodStart = new Date(
            today.getFullYear(),
            today.getMonth(),
            1,
          );
          const periodEnd = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0,
          );
          const amount = contract.monthlyRent;
          const vatRate = await this.getVatRate(contract.tenantId);
          const vatAmount = Math.round(Number(amount) * vatRate * 100) / 100;
          const totalAmount =
            Math.round((Number(amount) + vatAmount) * 100) / 100;
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

          // Email клиенту о новом счёте
          try {
            const email = contract.client?.contactEmail;
            if (email) {
              const tenant = contract.tenant;
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
                  dueDate: dueDate.toLocaleDateString('ru-RU'),
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
          } catch (emailErr: any) {
            this.logger.error(
              `Ошибка отправки email для счёта ${invoiceNumber}: ${emailErr.message}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Ошибка генерации счёта для договора ${contract.id}: ${err.message}`,
          );
        }
      }

      if (generated > 0) this.logger.log(`Сгенерировано счетов: ${generated}`);
    } finally {
      await this.redis.releaseLock('cron:monthly-invoices');
    }
  }

  /** Переводит просроченные счета в статус overdue и блокирует СКУД */
  @Cron('0 9 * * *')
  async checkOverdueInvoices() {
    if (!(await this.redis.acquireLock('cron:overdue-invoices', 1800))) return;
    try {
      const now = new Date();
      const gracePeriod = new Date();
      gracePeriod.setDate(gracePeriod.getDate() - 3);

      const overdue = await this.prisma.invoice.updateMany({
        where: { status: 'pending', dueDate: { lt: now } },
        data: { status: 'overdue' },
      });
      if (overdue.count > 0)
        this.logger.warn(`Просрочено счетов: ${overdue.count}`);

      const critical = await this.prisma.invoice.findMany({
        where: { status: 'overdue', dueDate: { lt: gracePeriod } },
        select: { contractId: true, invoiceNumber: true },
      });

      for (const inv of critical) {
        try {
          await this.prisma.accessCard.updateMany({
            where: { contractId: inv.contractId, isActive: true },
            data: {
              isActive: false,
              blockedReason: `Просрочка: ${inv.invoiceNumber}`,
              blockedAt: new Date(),
            },
          });
        } catch (err) {
          this.logger.error(
            `Ошибка блокировки СКУД для ${inv.invoiceNumber}: ${err.message}`,
          );
        }
      }
      if (critical.length > 0)
        this.logger.warn(`СКУД заблокирован: ${critical.length} договоров`);
    } finally {
      await this.redis.releaseLock('cron:overdue-invoices');
    }
  }

  /** Отправляет напоминания об оплате за 3 дня до срока */
  @Cron('0 10 * * *')
  async sendPaymentReminders() {
    if (!(await this.redis.acquireLock('cron:payment-reminders', 1800))) return;
    try {
      const threeDaysLater = new Date();
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming = await this.prisma.invoice.findMany({
        where: {
          status: 'pending',
          dueDate: { gte: today, lte: threeDaysLater },
        },
        include: {
          contract: {
            include: {
              client: true,
              unit: { include: { property: true } },
            },
          },
        },
      });

      for (const invoice of upcoming) {
        try {
          const email = invoice.contract?.client?.contactEmail;
          if (email) {
            // Получение реквизитов арендодателя
            const tenant = await this.prisma.tenant.findUnique({
              where: { id: invoice.tenantId },
            });

            await this.mailer.send(
              email,
              `Напоминание об оплате счёта ${invoice.invoiceNumber}`,
              'invoice',
              {
                invoiceNumber: invoice.invoiceNumber,
                amount: Number(invoice.totalAmount).toLocaleString('ru-RU'),
                vatAmount: Number(invoice.vatAmount || 0) > 0
                  ? Number(invoice.vatAmount).toLocaleString('ru-RU')
                  : null,
                dueDate: invoice.dueDate.toLocaleDateString('ru-RU'),
                unitNumber: invoice.contract?.unit?.unitNumber || `#${invoice.contract?.unit?.id}`,
                propertyName: invoice.contract?.unit?.property?.name || '',
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
          this.logger.log(
            `Напоминание: счёт ${invoice.invoiceNumber} — оплата до ${invoice.dueDate.toLocaleDateString('ru-RU')}`,
          );
        } catch (err) {
          this.logger.error(
            `Ошибка отправки напоминания ${invoice.invoiceNumber}: ${err.message}`,
          );
        }
      }

      if (upcoming.length > 0)
        this.logger.log(`Отправлено напоминаний: ${upcoming.length}`);
    } finally {
      await this.redis.releaseLock('cron:payment-reminders');
    }
  }

  /** Проверяет статусы документов в ЭДО */
  @Cron('*/30 * * * *')
  async checkEdoStatuses() {
    if (!(await this.redis.acquireLock('cron:edo-statuses', 900))) return;
    try {
      const { checked, updated } = await this.edo.checkAllPendingStatuses();
      if (checked > 0) {
        this.logger.log(`ЭДО: проверено ${checked}, обновлено ${updated}`);
      }
    } finally {
      await this.redis.releaseLock('cron:edo-statuses');
    }
  }

  /** Завершает истёкшие договоры и освобождает помещения */
  @Cron('0 0 * * *')
  async checkExpiredContracts() {
    if (!(await this.redis.acquireLock('cron:expired-contracts', 3600))) return;
    try {
      const now = new Date();
      const expired = await this.prisma.contract.findMany({
        where: { status: 'active', endDate: { lt: now } },
      });

      for (const contract of expired) {
        try {
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
        } catch (err) {
          this.logger.error(
            `Ошибка завершения договора ${contract.id}: ${err.message}`,
          );
        }
      }
      if (expired.length > 0)
        this.logger.log(`Истекло договоров: ${expired.length}`);
    } finally {
      await this.redis.releaseLock('cron:expired-contracts');
    }
  }

  /** Начисляет пени за просрочку: 0.1% в день, но не более 10% от суммы счёта */
  @Cron('0 8 * * *')
  async applyLateFees() {
    if (!(await this.redis.acquireLock('cron:late-fees', 3600))) return;
    try {
      const overdueInvoices = await this.prisma.invoice.findMany({
        where: { status: 'overdue' },
        include: {
          contract: {
            select: {
              contractNumber: true,
              tenantId: true,
              penaltyRate: true,
              penaltyMaxPercent: true,
            },
          },
        },
      });

      let applied = 0;
      for (const inv of overdueInvoices) {
        try {
          const daysOverdue = Math.floor(
            (Date.now() - new Date(inv.dueDate).getTime()) / 86400000,
          );
          if (daysOverdue <= 0) continue;

          const baseAmount = Number(inv.totalAmount);
          // Ставка пени из договора или дефолт 0.1%/день, max 10%
          const penaltyRate = inv.contract?.penaltyRate
            ? Number(inv.contract.penaltyRate) / 100
            : 0.001;
          const maxPenaltyRate = inv.contract?.penaltyMaxPercent
            ? Number(inv.contract.penaltyMaxPercent) / 100
            : 0.1;
          const penaltyAmount = Math.min(
            baseAmount * penaltyRate * daysOverdue,
            baseAmount * maxPenaltyRate,
          );

          const existingPenalty = await this.prisma.invoice.findFirst({
            where: {
              contractId: inv.contractId,
              invoiceNumber: { startsWith: `PEN-${inv.invoiceNumber}` },
            },
          });

          if (existingPenalty) {
            await this.prisma.invoice.update({
              where: { id: existingPenalty.id },
              data: {
                amount: penaltyAmount,
                vatAmount: 0,
                totalAmount: penaltyAmount,
              },
            });
          } else {
            await this.prisma.invoice.create({
              data: {
                tenantId: inv.contract.tenantId,
                contractId: inv.contractId,
                invoiceNumber: `PEN-${inv.invoiceNumber}`,
                amount: penaltyAmount,
                vatAmount: 0,
                totalAmount: penaltyAmount,
                dueDate: new Date(),
              },
            });
            applied++;
          }
        } catch (err) {
          this.logger.error(
            `Ошибка начисления пени для ${inv.invoiceNumber}: ${err.message}`,
          );
        }
      }

      if (applied > 0) this.logger.log(`Начислено пеней: ${applied}`);
    } finally {
      await this.redis.releaseLock('cron:late-fees');
    }
  }

  /** Уведомления об истекающих договорах (30, 60, 90 дней) */
  @Cron('0 7 * * *')
  async notifyExpiringContracts() {
    if (!(await this.redis.acquireLock('cron:expiring-notifications', 3600)))
      return;
    try {
      const milestones = [90, 60, 30];
      let sent = 0;

      for (const days of milestones) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const expiring = await this.prisma.contract.findMany({
          where: {
            status: { in: ['signed', 'active'] },
            endDate: { gte: targetDate, lt: nextDay },
          },
          include: {
            client: { select: { contactEmail: true, companyName: true } },
            unit: {
              select: {
                unitNumber: true,
                property: { select: { name: true } },
              },
            },
          },
        });

        for (const contract of expiring) {
          try {
            const email = contract.client?.contactEmail;
            if (email) {
              await this.mailer.send(
                email,
                `Договор ${contract.contractNumber} истекает через ${days} дней`,
                'contract-expiring',
                {
                  contractNumber: contract.contractNumber,
                  endDate: contract.endDate.toLocaleDateString('ru-RU'),
                  unitNumber: contract.unit?.unitNumber || '',
                  propertyName: contract.unit?.property?.name || '',
                },
              );
              sent++;
            }
          } catch (err) {
            this.logger.error(
              `Ошибка уведомления по договору ${contract.contractNumber}: ${err.message}`,
            );
          }
        }
      }

      if (sent > 0)
        this.logger.log(`Отправлено уведомлений об истечении: ${sent}`);
    } finally {
      await this.redis.releaseLock('cron:expiring-notifications');
    }
  }

  /** Удаляет записи аудита старше года */
  @Cron('0 2 * * *')
  async cleanupAuditLog() {
    if (!(await this.redis.acquireLock('cron:cleanup-audit', 1800))) return;
    try {
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const deleted = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: yearAgo } },
      });
      if (deleted.count > 0)
        this.logger.log(`Удалено записей аудита: ${deleted.count}`);
    } finally {
      await this.redis.releaseLock('cron:cleanup-audit');
    }
  }

  /** Инвалидирует кэш аналитики для пересчёта */
  @Cron('0 4 * * *')
  async refreshAnalyticsCache() {
    if (!(await this.redis.acquireLock('cron:refresh-analytics', 600))) return;
    try {
      await this.redis.delByPattern('analytics:*');
      await this.redis.delByPattern('platform:*');
      this.logger.log('Кэш аналитики инвалидирован');
    } finally {
      await this.redis.releaseLock('cron:refresh-analytics');
    }
  }
}
