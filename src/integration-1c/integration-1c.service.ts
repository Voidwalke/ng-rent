import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  Integration1CProvider,
  ExportPayload1C,
} from './integration-1c.provider';

@Injectable()
export class Integration1CService {
  private readonly logger = new Logger(Integration1CService.name);

  constructor(
    private prisma: PrismaService,
    private provider: Integration1CProvider,
    private redis: RedisService,
  ) {}

  /** Экспортирует новые счета в 1С */
  @Cron('0 */30 * * * *')
  async exportNewInvoices() {
    if (!(await this.redis.acquireLock('cron:1c:invoices', 1800))) return;
    try {
      const invoices = await this.prisma.invoice.findMany({
        where: { paymentReference: null, status: 'pending' },
        include: {
          contract: {
            include: { client: true, unit: { include: { property: true } } },
          },
          tenant: true,
        },
        take: 50,
      });

      for (const invoice of invoices) {
        try {
          const payload: ExportPayload1C = {
            type: 'invoice',
            tenantId: invoice.tenantId,
            entityId: invoice.id,
            data: {
              invoiceNumber: invoice.invoiceNumber,
              amount: Number(invoice.amount),
              vatAmount: Number(invoice.vatAmount),
              totalAmount: Number(invoice.totalAmount),
              dueDate: invoice.dueDate,
              clientInn: invoice.contract.client.inn,
              clientName: invoice.contract.client.companyName,
              propertyAddress: invoice.contract.unit.property.address,
              unitNumber: invoice.contract.unit.unitNumber,
            },
          };

          const result = await this.provider.exportEntity(payload);
          if (result.success && result.externalId) {
            await this.prisma.invoice.update({
              where: { id: invoice.id },
              data: { paymentReference: `1c:${result.externalId}` },
            });
          }
        } catch (err: any) {
          this.logger.error(`Экспорт счёта ${invoice.id}: ${err.message}`);
        }
      }

      if (invoices.length > 0) {
        this.logger.log(`Экспорт в 1С: ${invoices.length} счетов`);
      }
    } finally {
      await this.redis.releaseLock('cron:1c:invoices');
    }
  }

  /** Экспортирует подписанные договоры в 1С */
  @Cron('0 5 * * *')
  async exportSignedContracts() {
    if (!(await this.redis.acquireLock('cron:1c:contracts', 600))) return;
    try {
      const contracts = await this.prisma.contract.findMany({
        where: {
          status: 'signed',
          edoStatus: null,
        },
        include: {
          client: true,
          unit: { include: { property: true } },
          tenant: true,
        },
        take: 20,
      });

      for (const contract of contracts) {
        try {
          const payload: ExportPayload1C = {
            type: 'contract',
            tenantId: contract.tenantId,
            entityId: contract.id,
            data: {
              contractNumber: contract.contractNumber,
              startDate: contract.startDate,
              endDate: contract.endDate,
              monthlyRent: Number(contract.monthlyRent),
              depositAmount: Number(contract.depositAmount),
              clientInn: contract.client.inn,
              clientName: contract.client.companyName,
            },
          };

          const result = await this.provider.exportEntity(payload);
          if (result.success) {
            await this.prisma.contract.update({
              where: { id: contract.id },
              data: { edoStatus: 'exported_to_1c' },
            });
          }
        } catch (err: any) {
          this.logger.error(`Экспорт договора ${contract.id}: ${err.message}`);
        }
      }

      if (contracts.length > 0) {
        this.logger.log(`Экспорт в 1С: ${contracts.length} договоров`);
      }
    } finally {
      await this.redis.releaseLock('cron:1c:contracts');
    }
  }

  /** Ручной экспорт всех неотправленных счетов и договоров */
  async exportAll(tenantId: number) {
    try {
      return await this._doExportAll(tenantId);
    } catch (err: any) {
      this.logger.error(`Ошибка экспорта в 1С: ${err.message}`);
      return {
        invoices: { total: 0, sent: 0 },
        contracts: { total: 0, sent: 0 },
        error: 'Ошибка при экспорте в 1С',
      };
    }
  }

  private async _doExportAll(tenantId: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, paymentReference: null, status: 'pending' },
      include: {
        contract: {
          include: { client: true, unit: { include: { property: true } } },
        },
      },
    });

    let invoicesSent = 0;
    for (const invoice of invoices) {
      if (!invoice.contract?.client || !invoice.contract?.unit?.property) {
        this.logger.warn(`Счёт #${invoice.id} пропущен — неполные данные`);
        continue;
      }
      const result = await this.provider.exportEntity({
        type: 'invoice',
        tenantId,
        entityId: invoice.id,
        data: {
          invoiceNumber: invoice.invoiceNumber,
          amount: Number(invoice.amount),
          vatAmount: Number(invoice.vatAmount),
          totalAmount: Number(invoice.totalAmount),
          dueDate: invoice.dueDate,
          clientInn: invoice.contract.client.inn,
          clientName: invoice.contract.client.companyName,
          propertyAddress: invoice.contract.unit.property.address,
          unitNumber: invoice.contract.unit.unitNumber,
        },
      });
      if (result.success && result.externalId) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { paymentReference: `1c:${result.externalId}` },
        });
        invoicesSent++;
      }
    }

    const contracts = await this.prisma.contract.findMany({
      where: { tenantId, status: 'signed', edoStatus: null },
      include: { client: true, unit: { include: { property: true } } },
    });

    let contractsSent = 0;
    for (const contract of contracts) {
      if (!contract.client) {
        this.logger.warn(
          `Договор #${contract.id} пропущен — нет данных контрагента`,
        );
        continue;
      }
      const result = await this.provider.exportEntity({
        type: 'contract',
        tenantId,
        entityId: contract.id,
        data: {
          contractNumber: contract.contractNumber,
          startDate: contract.startDate,
          endDate: contract.endDate,
          monthlyRent: Number(contract.monthlyRent),
          depositAmount: Number(contract.depositAmount),
          clientInn: contract.client.inn,
          clientName: contract.client.companyName,
        },
      });
      if (result.success) {
        await this.prisma.contract.update({
          where: { id: contract.id },
          data: { edoStatus: 'exported_to_1c' },
        });
        contractsSent++;
      }
    }

    this.logger.log(
      `Ручной экспорт в 1С: ${invoicesSent}/${invoices.length} счетов, ${contractsSent}/${contracts.length} договоров`,
    );

    return {
      invoices: { total: invoices.length, sent: invoicesSent },
      contracts: { total: contracts.length, sent: contractsSent },
    };
  }

  /** Обрабатывает вебхук подтверждения оплаты из 1С */
  async handlePaymentWebhook(
    body: {
      invoiceNumber: string;
      paidAmount: number;
      paidAt: string;
      paymentReference: string;
    },
    tenantId?: number,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: body.invoiceNumber,
        ...(tenantId && { tenantId }),
      },
    });

    if (!invoice) {
      this.logger.warn(`1С webhook: счёт ${body.invoiceNumber} не найден`);
      return { success: false, error: 'Invoice not found' };
    }

    if (invoice.status === 'paid') {
      return { success: true, message: 'Already paid' };
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'paid',
        paidAt: new Date(body.paidAt),
        paidAmount: body.paidAmount,
        paymentReference: body.paymentReference,
      },
    });

    this.logger.log(
      `1С webhook: оплата счёта ${body.invoiceNumber} подтверждена`,
    );
    return { success: true };
  }

  /** Обрабатывает вебхук обновления данных контрагента из 1С */
  async handleClientUpdate(
    body: {
      inn: string;
      companyName?: string;
      legalAddress?: string;
      bankAccount?: string;
      bik?: string;
    },
    tenantId?: number,
  ) {
    const updated = await this.prisma.client.updateMany({
      where: { inn: body.inn, ...(tenantId && { tenantId }) },
      data: {
        ...(body.companyName && { companyName: body.companyName }),
        ...(body.legalAddress && { legalAddress: body.legalAddress }),
        ...(body.bankAccount && { bankAccount: body.bankAccount }),
        ...(body.bik && { bik: body.bik }),
      },
    });

    this.logger.log(
      `1С webhook: обновлён клиент ИНН ${body.inn}, затронуто: ${updated.count}`,
    );
    return { success: true, updated: updated.count };
  }
}
