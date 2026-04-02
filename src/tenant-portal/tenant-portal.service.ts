import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class TenantPortalService {
  private readonly logger = new Logger(TenantPortalService.name);

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private mailer: MailerService,
  ) {}

  async getMyApplications(tenantId: number, userId: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client) return [];

    return this.prisma.application.findMany({
      where: { tenantId, clientId: client.id },
      include: {
        unit: {
          select: {
            unitNumber: true,
            floor: true,
            areaSqm: true,
            priceMonth: true,
            property: { select: { name: true, address: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApplication(tenantId: number, userId: number, data: any) {
    // Поиск помещения БЕЗ фильтра по tenantId — каталог публичный,
    // арендатор может подать заявку на помещение любой УК
    const unit = await this.prisma.unit.findFirst({
      where: { id: data.unitId, status: 'available', deletedAt: null },
      include: { property: { select: { name: true, tenantId: true, isPublished: true } } },
    });
    if (!unit) throw new BadRequestException('Помещение недоступно');
    if (!unit.property?.isPublished) throw new BadRequestException('Объект не опубликован');

    // tenantId заявки = tenantId владельца помещения (УК), а не арендатора
    const ownerTenantId = unit.tenantId;

    // Поиск или создание клиента в тенанте ВЛАДЕЛЬЦА помещения
    let client = await this.prisma.client.findFirst({
      where: { tenantId: ownerTenantId, userId },
    });
    if (!client) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException();
      client = await this.prisma.client.create({
        data: {
          tenantId: ownerTenantId,
          companyName: user.fullName,
          contactName: user.fullName,
          contactEmail: user.email,
          contactPhone: user.phone || '',
          userId,
        },
      });
    }

    const application = await this.prisma.application.create({
      data: {
        tenantId: ownerTenantId,
        unitId: data.unitId,
        clientId: client.id,
        status: 'submitted',
        desiredStart: new Date(data.desiredStart),
        desiredEnd: new Date(data.desiredEnd),
        desiredPrice: data.desiredPrice,
        comment: data.comment,
      },
    });

    // Уведомление менеджеров о новой заявке
    try {
      await this.notifications.notifyManagers(
        ownerTenantId,
        'application_submitted',
        'Новая заявка на аренду',
        `Заявка №${application.id} от ${client.companyName || client.contactName}`,
        { applicationId: application.id },
      );

      // Email менеджерам ВЛАДЕЛЬЦА помещения о новой заявке
      const managers = await this.prisma.user.findMany({
        where: { tenantId: ownerTenantId, role: { in: ['admin', 'manager'] }, deletedAt: null },
        select: { email: true },
      });
      for (const manager of managers) {
        if (manager.email) {
          await this.mailer.send(
            manager.email,
            `Новая заявка №${application.id} на аренду`,
            'new-application',
            {
              applicationId: application.id,
              clientName: client.companyName || client.contactName,
              propertyName: unit.property?.name || '',
              unitNumber: unit.unitNumber || `#${unit.id}`,
              desiredStart: new Date(data.desiredStart).toLocaleDateString('ru-RU'),
              desiredEnd: new Date(data.desiredEnd).toLocaleDateString('ru-RU'),
              comment: data.comment || null,
            },
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Ошибка уведомления менеджеров (application #${application.id}): ${err.message}`);
    }

    return application;
  }

  async getApplication(tenantId: number, userId: number, id: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client)
      throw new NotFoundException('Клиент не привязан к пользователю');
    const app = await this.prisma.application.findFirst({
      where: { id, tenantId, clientId: client.id },
      include: {
        unit: {
          include: { property: { select: { name: true, address: true } } },
        },
      },
    });
    if (!app) throw new NotFoundException('Заявка не найдена');
    return app;
  }

  async getMyContracts(tenantId: number, userId: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client) return [];

    return this.prisma.contract.findMany({
      where: { tenantId, clientId: client.id },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
            areaSqm: true,
            priceMonth: true,
            description: true,
            status: true,
            property: { select: { name: true, address: true, city: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getContract(tenantId: number, userId: number, id: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client)
      throw new NotFoundException('Клиент не привязан к пользователю');
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId, clientId: client.id },
      include: {
        unit: { include: { property: true } },
        invoices: { orderBy: { dueDate: 'desc' } },
      },
    });
    if (!contract) throw new NotFoundException('Договор не найден');
    return contract;
  }

  async getMyInvoices(tenantId: number, userId: number, status?: string) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client) return [];

    const where: any = {
      tenantId,
      contract: { clientId: client.id },
    };
    if (status) where.status = status;

    return this.prisma.invoice.findMany({
      where,
      include: {
        contract: {
          select: {
            contractNumber: true,
            unit: { select: { unitNumber: true } },
          },
        },
      },
      orderBy: { dueDate: 'desc' },
    });
  }

  async getInvoice(tenantId: number, userId: number, id: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client)
      throw new NotFoundException('Клиент не привязан к пользователю');
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, contract: { clientId: client.id } },
      include: { contract: { include: { unit: true } } },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    return invoice;
  }

  async payInvoice(tenantId: number, userId: number, invoiceId: number) {
    // Проверка, что счёт принадлежит этому арендатору
    const client = await this.getClientByUser(tenantId, userId);
    if (!client)
      throw new NotFoundException('Клиент не привязан к пользователю');
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, contract: { clientId: client.id } },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');

    return this.payments.createPayment(tenantId, invoiceId);
  }

  async getMyAccessCards(tenantId: number, userId: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client) return [];

    return this.prisma.accessCard.findMany({
      where: { tenantId, clientId: client.id },
      include: { contract: { select: { contractNumber: true } } },
    });
  }

  async getCardQr(tenantId: number, userId: number, cardId: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client)
      throw new NotFoundException('Клиент не привязан к пользователю');

    const card = await this.prisma.accessCard.findFirst({
      where: { id: cardId, tenantId, clientId: client.id },
      select: { id: true, qrToken: true, cardNumber: true, holderName: true, isActive: true },
    });
    if (!card) throw new NotFoundException('Карта не найдена');

    if (!card.qrToken) {
      const qrToken = crypto.randomBytes(16).toString('hex');
      await this.prisma.accessCard.update({
        where: { id: card.id },
        data: { qrToken },
      });
      return { qrToken, cardNumber: card.cardNumber, holderName: card.holderName, isActive: card.isActive };
    }

    return { qrToken: card.qrToken, cardNumber: card.cardNumber, holderName: card.holderName, isActive: card.isActive };
  }

  async getMyDocuments(tenantId: number, userId: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client) return [];

    // Документы привязанные к договорам клиента
    const contracts = await this.prisma.contract.findMany({
      where: { tenantId, clientId: client.id },
      select: { id: true },
    });
    const contractIds = contracts.map((c) => c.id);

    return this.prisma.document.findMany({
      where: {
        tenantId,
        entityType: 'contract',
        entityId: { in: contractIds },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProfile(tenantId: number, userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const client = await this.getClientByUser(tenantId, userId);
    return {
      user,
      company: client
        ? {
            id: client.id,
            companyName: client.companyName,
            inn: client.inn,
            contactPhone: client.contactPhone,
          }
        : null,
    };
  }

  async updateProfile(tenantId: number, userId: number, dto: any) {
    // Обновление пользователя
    const userData: any = {};
    if (dto.fullName) userData.fullName = dto.fullName;
    if (dto.phone) userData.phone = dto.phone;

    if (Object.keys(userData).length) {
      await this.prisma.user.update({ where: { id: userId }, data: userData });
    }

    // Обновление данных компании (клиент)
    const clientData: any = {};
    if (dto.companyName) clientData.companyName = dto.companyName;
    if (dto.inn) clientData.inn = dto.inn;
    if (dto.legalAddress) clientData.legalAddress = dto.legalAddress;

    if (Object.keys(clientData).length) {
      const client = await this.getClientByUser(tenantId, userId);
      if (client) {
        await this.prisma.client.update({
          where: { id: client.id },
          data: clientData,
        });
      }
    }

    return this.getProfile(tenantId, userId);
  }

  async getMyMaintenance(tenantId: number, userId: number) {
    return this.prisma.maintenanceRequest.findMany({
      where: { tenantId, reportedBy: userId },
      include: {
        unit: {
          select: { unitNumber: true, property: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMaintenance(tenantId: number, userId: number, dto: any) {
    return this.prisma.maintenanceRequest.create({
      data: {
        tenantId,
        unitId: dto.unitId,
        reportedBy: userId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'medium',
      },
    });
  }

  async acceptContract(tenantId: number, userId: number, contractId: number) {
    const client = await this.getClientByUser(tenantId, userId);
    if (!client)
      throw new NotFoundException('Клиент не привязан к пользователю');

    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId, clientId: client.id },
    });
    if (!contract) throw new NotFoundException('Договор не найден');

    if (contract.status !== 'draft' && contract.status !== 'sent') {
      throw new BadRequestException(
        'Принять можно только договор в статусе «Черновик» или «Отправлен»',
      );
    }

    return this.prisma.contract.update({
      where: { id: contractId },
      data: {
        edoStatus: 'signed',
        signedAt: new Date(),
      },
      include: {
        unit: { include: { property: true } },
        invoices: { orderBy: { dueDate: 'desc' } },
      },
    });
  }

  /** Находим ВСЕ client-записи юзера (во всех тенантах, где он арендатор) */
  private async getAllClientsByUser(userId: number) {
    return this.prisma.client.findMany({
      where: { userId },
    });
  }

  /** Экспорт счетов арендатора в Excel */
  async exportMyInvoicesExcel(userId: number): Promise<Buffer> {
    const clients = await this.getAllClientsByUser(userId);
    if (clients.length === 0) return this.emptyExcel('Счета');

    const clientIds = clients.map((c) => c.id);

    const invoices = await this.prisma.invoice.findMany({
      where: { contract: { clientId: { in: clientIds } } },
      include: {
        contract: {
          include: {
            client: true,
            unit: { include: { property: true } },
          },
        },
        tenant: { select: { name: true, inn: true } },
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
      'Арендодатель (УК)': (inv as any).tenant?.name || '',
      'ИНН арендодателя': (inv as any).tenant?.inn || '',
      'Объект': inv.contract?.unit?.property?.name || '',
      'Адрес объекта': inv.contract?.unit?.property?.address || '',
      'Помещение': inv.contract?.unit?.unitNumber || '',
      'Номер договора': inv.contract?.contractNumber || '',
    }));

    return this.buildExcel(rows, 'Счета', [
      22, 14, 14, 14, 14, 14, 12, 14, 12, 10, 28, 14, 20, 30, 12, 20,
    ]);
  }

  /** Экспорт договоров арендатора в Excel */
  async exportMyContractsExcel(userId: number): Promise<Buffer> {
    const clients = await this.getAllClientsByUser(userId);
    if (clients.length === 0) return this.emptyExcel('Договоры');

    const clientIds = clients.map((c) => c.id);

    const contracts = await this.prisma.contract.findMany({
      where: { clientId: { in: clientIds } },
      include: {
        client: true,
        unit: { include: { property: true } },
        tenant: { select: { name: true, inn: true, kpp: true, legalAddress: true } },
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
      'Арендодатель (УК)': (c as any).tenant?.name || '',
      'ИНН арендодателя': (c as any).tenant?.inn || '',
      'КПП арендодателя': (c as any).tenant?.kpp || '',
      'Юр. адрес арендодателя': (c as any).tenant?.legalAddress || '',
      'Объект': c.unit?.property?.name || '',
      'Адрес объекта': c.unit?.property?.address || '',
      'Помещение': c.unit?.unitNumber || '',
      'Площадь (м²)': Number(c.unit?.areaSqm || 0),
      'Дата подписания': c.signedAt?.toISOString().slice(0, 10) || '',
    }));

    return this.buildExcel(rows, 'Договоры', [
      20, 12, 14, 14, 18, 12, 12, 28, 14, 12, 30, 20, 30, 12, 12, 14,
    ]);
  }

  /** Экспорт актов арендатора в Excel */
  async exportMyActsExcel(userId: number): Promise<Buffer> {
    const clients = await this.getAllClientsByUser(userId);
    if (clients.length === 0) return this.emptyExcel('Акты');

    const clientIds = clients.map((c) => c.id);

    const contracts = await this.prisma.contract.findMany({
      where: {
        clientId: { in: clientIds },
        status: { in: ['signed', 'active', 'expired', 'terminated'] },
      },
      include: {
        client: true,
        unit: { include: { property: true } },
        invoices: { where: { status: 'paid' }, orderBy: { paidAt: 'asc' } },
        tenant: { select: { name: true, inn: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows: Record<string, unknown>[] = [];

    for (const c of contracts) {
      if (c.signedAt) {
        rows.push({
          'Тип акта': 'Акт приёма-передачи',
          'Номер договора': c.contractNumber,
          'Дата акта': c.signedAt.toISOString().slice(0, 10),
          'Арендодатель (УК)': (c as any).tenant?.name || '',
          'ИНН арендодателя': (c as any).tenant?.inn || '',
          'Объект': c.unit?.property?.name || '',
          'Адрес': c.unit?.property?.address || '',
          'Помещение': c.unit?.unitNumber || '',
          'Площадь (м²)': Number(c.unit?.areaSqm || 0),
          'Арендная плата/мес': Number(c.monthlyRent),
          'Описание': `Передача помещения ${c.unit?.unitNumber || ''} по договору ${c.contractNumber}`,
        });
      }

      if (c.invoices && c.invoices.length > 0) {
        const totalBilled = c.invoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
        const totalPaid = c.invoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
        const balance = totalPaid - totalBilled;

        rows.push({
          'Тип акта': 'Акт сверки взаиморасчётов',
          'Номер договора': c.contractNumber,
          'Дата акта': new Date().toISOString().slice(0, 10),
          'Арендодатель (УК)': (c as any).tenant?.name || '',
          'ИНН арендодателя': (c as any).tenant?.inn || '',
          'Объект': c.unit?.property?.name || '',
          'Адрес': c.unit?.property?.address || '',
          'Помещение': c.unit?.unitNumber || '',
          'Площадь (м²)': Number(c.unit?.areaSqm || 0),
          'Арендная плата/мес': Number(c.monthlyRent),
          'Описание': `Начислено: ${totalBilled} ₽, Оплачено: ${totalPaid} ₽, Сальдо: ${balance >= 0 ? '+' : ''}${balance} ₽ (${c.invoices.length} счетов)`,
        });
      }
    }

    return this.buildExcel(rows, 'Акты', [
      28, 20, 14, 28, 14, 20, 30, 12, 12, 18, 50,
    ]);
  }

  private buildExcel(rows: Record<string, unknown>[], sheetName: string, colWidths: number[]): Buffer {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = colWidths.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private emptyExcel(sheetName: string): Buffer {
    const ws = XLSX.utils.json_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private async getClientByUser(tenantId: number, userId: number) {
    return this.prisma.client.findFirst({
      where: { tenantId, userId },
    });
  }
}
