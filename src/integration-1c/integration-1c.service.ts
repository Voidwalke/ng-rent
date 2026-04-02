import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as XLSX from 'xlsx';
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

  /** Экспорт счетов в Excel для загрузки в 1С */
  async exportInvoicesExcel(tenantId: number): Promise<Buffer> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        contract: {
          include: { client: true, unit: { include: { property: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = invoices.map((inv) => ({
      'Номер счёта': inv.invoiceNumber,
      'Дата выставления': inv.createdAt.toISOString().slice(0, 10),
      'Срок оплаты': inv.dueDate.toISOString().slice(0, 10),
      'Период начало': inv.periodStart?.toISOString().slice(0, 10) || '',
      'Период конец': inv.periodEnd?.toISOString().slice(0, 10) || '',
      'Сумма без НДС': Number(inv.amount),
      'НДС': Number(inv.vatAmount || 0),
      'Итого с НДС': Number(inv.totalAmount),
      'Оплачено': Number(inv.paidAmount || 0),
      'Статус': inv.status,
      'ИНН контрагента': inv.contract?.client?.inn || '',
      'Контрагент': inv.contract?.client?.companyName || '',
      'Объект': inv.contract?.unit?.property?.name || '',
      'Адрес объекта': inv.contract?.unit?.property?.address || '',
      'Помещение': inv.contract?.unit?.unitNumber || '',
      'Номер договора': inv.contract?.contractNumber || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Ширина колонок
    ws['!cols'] = [
      { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
      { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 30 }, { wch: 12 },
      { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Счета');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  /** Экспорт договоров в Excel для загрузки в 1С */
  async exportContractsExcel(tenantId: number): Promise<Buffer> {
    const contracts = await this.prisma.contract.findMany({
      where: { tenantId },
      include: {
        client: true,
        unit: { include: { property: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = contracts.map((c) => ({
      'Номер договора': c.contractNumber,
      'Статус': c.status,
      'Дата начала': c.startDate.toISOString().slice(0, 10),
      'Дата окончания': c.endDate.toISOString().slice(0, 10),
      'Арендная плата/мес': Number(c.monthlyRent),
      'Депозит': Number(c.depositAmount || 0),
      'День оплаты': c.paymentDay,
      'ИНН контрагента': c.client?.inn || '',
      'КПП контрагента': c.client?.kpp || '',
      'Контрагент': c.client?.companyName || '',
      'Контактное лицо': c.client?.contactName || '',
      'Email контрагента': c.client?.contactEmail || '',
      'Телефон контрагента': c.client?.contactPhone || '',
      'Юр. адрес': c.client?.legalAddress || '',
      'Р/с': c.client?.bankAccount || '',
      'БИК': c.client?.bik || '',
      'Объект': c.unit?.property?.name || '',
      'Адрес объекта': c.unit?.property?.address || '',
      'Помещение': c.unit?.unitNumber || '',
      'Площадь (м²)': Number(c.unit?.areaSqm || 0),
      'Дата подписания': c.signedAt?.toISOString().slice(0, 10) || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
      { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 30 }, { wch: 22 },
      { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Договоры');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  /** Экспорт актов в Excel для загрузки в 1С */
  async exportActsExcel(tenantId: number): Promise<Buffer> {
    // Получение всех договоров с актами (подписанные и активные)
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: ['signed', 'active', 'expired', 'terminated'] },
      },
      include: {
        client: true,
        unit: { include: { property: true } },
        invoices: {
          where: { status: 'paid' },
          orderBy: { paidAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows: any[] = [];

    for (const c of contracts) {
      // Акт приёма-передачи
      if (c.signedAt) {
        rows.push({
          'Тип акта': 'Акт приёма-передачи',
          'Номер договора': c.contractNumber,
          'Дата акта': c.signedAt.toISOString().slice(0, 10),
          'Контрагент': c.client?.companyName || '',
          'ИНН контрагента': c.client?.inn || '',
          'КПП контрагента': c.client?.kpp || '',
          'Объект': c.unit?.property?.name || '',
          'Адрес': c.unit?.property?.address || '',
          'Помещение': c.unit?.unitNumber || '',
          'Площадь (м²)': Number(c.unit?.areaSqm || 0),
          'Арендная плата/мес': Number(c.monthlyRent),
          'Депозит': Number(c.depositAmount || 0),
          'Описание': `Передача помещения ${c.unit?.unitNumber || ''} по договору ${c.contractNumber}`,
        });
      }

      // Акт сверки (по оплаченным счетам)
      if (c.invoices && c.invoices.length > 0) {
        const totalBilled = c.invoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
        const totalPaid = c.invoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
        const balance = totalPaid - totalBilled;

        rows.push({
          'Тип акта': 'Акт сверки взаиморасчётов',
          'Номер договора': c.contractNumber,
          'Дата акта': new Date().toISOString().slice(0, 10),
          'Контрагент': c.client?.companyName || '',
          'ИНН контрагента': c.client?.inn || '',
          'КПП контрагента': c.client?.kpp || '',
          'Объект': c.unit?.property?.name || '',
          'Адрес': c.unit?.property?.address || '',
          'Помещение': c.unit?.unitNumber || '',
          'Площадь (м²)': Number(c.unit?.areaSqm || 0),
          'Арендная плата/мес': Number(c.monthlyRent),
          'Депозит': Number(c.depositAmount || 0),
          'Описание': `Начислено: ${totalBilled} ₽, Оплачено: ${totalPaid} ₽, Сальдо: ${balance >= 0 ? '+' : ''}${balance} ₽ (${c.invoices.length} счетов)`,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 28 }, { wch: 14 },
      { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
      { wch: 18 }, { wch: 12 }, { wch: 50 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Акты');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
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

  /** Возвращает изменения с момента since для синхронизации с 1С */
  async getChangesSince(tenantId: number, since: Date) {
    const where = { tenantId, createdAt: { gte: since } };
    const whereNotDeleted = { ...where, deletedAt: null };

    const [properties, units, clients, invoices, contracts] = await Promise.all([
      this.prisma.property.findMany({
        where: whereNotDeleted,
        select: { id: true, name: true, address: true, city: true, type: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.unit.findMany({
        where: whereNotDeleted,
        select: { id: true, propertyId: true, unitNumber: true, floor: true, areaSqm: true, priceMonth: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.findMany({
        where: whereNotDeleted,
        select: { id: true, companyName: true, inn: true, kpp: true, contactEmail: true, contactPhone: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { id: true, invoiceNumber: true, amount: true, vatAmount: true, totalAmount: true, status: true, paidAt: true, createdAt: true, contract: { select: { client: { select: { inn: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.contract.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { id: true, contractNumber: true, monthlyRent: true, depositAmount: true, status: true, startDate: true, endDate: true, createdAt: true, client: { select: { inn: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Также ищем счета оплаченные после since (даже если созданы раньше)
    const recentlyPaid = await this.prisma.invoice.findMany({
      where: { tenantId, paidAt: { gte: since }, createdAt: { lt: since } },
      select: { id: true, invoiceNumber: true, amount: true, vatAmount: true, totalAmount: true, status: true, paidAt: true, paidAmount: true, paymentReference: true, createdAt: true, contract: { select: { client: { select: { inn: true } } } } },
      orderBy: { paidAt: 'asc' },
    });

    return {
      since: since.toISOString(),
      properties,
      units,
      clients,
      invoices,
      contracts,
      recentlyPaid,
      total: properties.length + units.length + clients.length + invoices.length + contracts.length + recentlyPaid.length,
    };
  }

  /** Возвращает время последней синхронизации с 1С */
  async getLastSyncTime(tenantId: number): Promise<string | null> {
    // Поиск последнего счёта, оплаченного через 1С (paymentReference начинается с "1c")
    const lastPaid = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        paymentReference: { startsWith: '1c' },
      },
      orderBy: { paidAt: 'desc' },
      select: { paidAt: true },
    });

    if (lastPaid?.paidAt) {
      return lastPaid.paidAt.toISOString();
    }

    // Или последний экспортированный контракт
    const lastExported = await this.prisma.contract.findFirst({
      where: {
        tenantId,
        edoStatus: 'exported_to_1c',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return lastExported?.createdAt?.toISOString() || null;
  }
}
