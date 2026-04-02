import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список клиентов с пагинацией и поиском */
  async findAll(
    tenantId: number,
    filters?: { search?: string; page?: number; limit?: number },
  ) {
    const where: any = { tenantId, deletedAt: null };
    if (filters?.search) {
      where.OR = [
        { companyName: { contains: filters.search, mode: 'insensitive' } },
        { inn: { contains: filters.search } },
        { contactName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    // Вычисление суммы просроченных счетов для каждого клиента
    const clientIds = clients.map((c) => c.id);
    const overdueAgg = clientIds.length
      ? await this.prisma.invoice.groupBy({
          by: ['contractId'],
          where: {
            tenantId,
            status: 'overdue',
            contract: { clientId: { in: clientIds } },
          },
          _sum: { totalAmount: true },
        })
      : [];

    // Маппинг contractId → clientId
    const contractClientMap: Record<number, number> = {};
    if (overdueAgg.length) {
      const contracts = await this.prisma.contract.findMany({
        where: { id: { in: overdueAgg.map((a) => a.contractId) } },
        select: { id: true, clientId: true },
      });
      for (const c of contracts) {
        contractClientMap[c.id] = c.clientId;
      }
    }

    const overdueByClient: Record<number, number> = {};
    for (const agg of overdueAgg) {
      const cid = contractClientMap[agg.contractId];
      if (cid) {
        overdueByClient[cid] =
          (overdueByClient[cid] || 0) + (Number(agg._sum.totalAmount) || 0);
      }
    }

    const data = clients.map((c) => ({
      ...c,
      overdueAmount: overdueByClient[c.id] || 0,
    }));

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Возвращает клиента по идентификатору */
  async findOne(id: number, tenantId?: number) {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null, ...(tenantId && { tenantId }) },
    });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  /** Создаёт нового клиента */
  async create(tenantId: number, dto: CreateClientDto) {
    if (dto.inn) {
      const existing = await this.prisma.client.findFirst({
        where: { tenantId, inn: dto.inn, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException(`Контрагент с ИНН ${dto.inn} уже существует`);
      }
    }
    return this.prisma.client.create({
      data: { ...dto, tenantId },
    });
  }

  /** Обновляет данные клиента */
  async update(id: number, tenantId: number, dto: any) {
    await this.findOne(id, tenantId);
    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  /** Удаляет клиента (мягкое удаление) */
  async softDelete(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    const activeContracts = await this.prisma.contract.count({
      where: { clientId: id, status: { in: ['signed', 'active'] } },
    });
    if (activeContracts > 0) {
      throw new BadRequestException(
        'Нельзя удалить клиента с активными договорами',
      );
    }
    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Клиент удалён' };
  }

  /** Возвращает историю взаимодействий клиента */
  async getHistory(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    const [applications, contracts, invoices, payments] = await Promise.all([
      this.prisma.application.findMany({
        where: { clientId: id, tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          desiredStart: true,
          desiredEnd: true,
          createdAt: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { clientId: id, tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          contractNumber: true,
          status: true,
          startDate: true,
          endDate: true,
          monthlyRent: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, contract: { clientId: id } },
        orderBy: { dueDate: 'desc' },
        take: 50,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          dueDate: true,
          paidAt: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, invoice: { contract: { clientId: id } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          amount: true,
          status: true,
          provider: true,
          createdAt: true,
        },
      }),
    ]);
    return { applications, contracts, invoices, payments };
  }
}
