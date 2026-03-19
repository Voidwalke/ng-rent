import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  /** Экспортирует новые счета в 1С */
  @Cron('0 */30 * * * *')
  async exportNewInvoices() {
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
    }

    if (invoices.length > 0) {
      this.logger.log(`Экспорт в 1С: ${invoices.length} счетов`);
    }
  }

  /** Экспортирует подписанные договоры в 1С */
  @Cron('0 5 * * *')
  async exportSignedContracts() {
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

      await this.provider.exportEntity(payload);
    }

    if (contracts.length > 0) {
      this.logger.log(`Экспорт в 1С: ${contracts.length} договоров`);
    }
  }

  /** Ручной экспорт всех неотправленных счетов и договоров */
  async exportAll(tenantId: number) {
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
      if (result.success) contractsSent++;
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
