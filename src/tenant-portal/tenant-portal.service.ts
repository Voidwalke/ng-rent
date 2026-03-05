import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class TenantPortalService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
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
            areaSqm: true,
            priceMonth: true,
            property: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApplication(tenantId: number, userId: number, data: any) {
    let client = await this.getClientByUser(tenantId, userId);
    if (!client) {
      // Автоматически создаём клиента из пользователя
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException();
      client = await this.prisma.client.create({
        data: {
          tenantId,
          companyName: user.fullName,
          contactName: user.fullName,
          contactEmail: user.email,
          contactPhone: user.phone || '',
          userId,
        },
      });
    }

    // Проверяем доступность помещения
    const unit = await this.prisma.unit.findFirst({
      where: { id: data.unitId, status: 'available', deletedAt: null },
    });
    if (!unit) throw new BadRequestException('Помещение недоступно');

    return this.prisma.application.create({
      data: {
        tenantId,
        unitId: data.unitId,
        clientId: client.id,
        status: 'submitted',
        desiredStart: new Date(data.desiredStart),
        desiredEnd: new Date(data.desiredEnd),
        desiredPrice: data.desiredPrice,
        comment: data.comment,
      },
    });
  }

  async getApplication(tenantId: number, userId: number, id: number) {
    const client = await this.getClientByUser(tenantId, userId);
    const app = await this.prisma.application.findFirst({
      where: { id, tenantId, clientId: client?.id },
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
            unitNumber: true,
            areaSqm: true,
            property: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getContract(tenantId: number, userId: number, id: number) {
    const client = await this.getClientByUser(tenantId, userId);
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId, clientId: client?.id },
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
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, contract: { clientId: client?.id } },
      include: { contract: { include: { unit: true } } },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    return invoice;
  }

  async payInvoice(tenantId: number, userId: number, invoiceId: number) {
    // Проверяем что счёт принадлежит этому арендатору
    const client = await this.getClientByUser(tenantId, userId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, contract: { clientId: client?.id } },
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

  private async getClientByUser(tenantId: number, userId: number) {
    return this.prisma.client.findFirst({
      where: { tenantId, userId },
    });
  }
}
