import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { validateTransition } from './state-machine';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список заявок с фильтрацией и пагинацией */
  async findAll(
    tenantId: number,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);

    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          unit: {
            select: {
              id: true,
              floor: true,
              areaSqm: true,
              priceMonth: true,
            },
          },
          client: {
            select: { id: true, companyName: true, contactName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.application.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Возвращает заявку по идентификатору */
  async findOne(id: number, tenantId?: number) {
    const app = await this.prisma.application.findFirst({
      where: { id, ...(tenantId && { tenantId }) },
      include: {
        unit: { include: { property: true } },
        client: true,
        contracts: true,
      },
    });
    if (!app) throw new NotFoundException('Заявка не найдена');
    return app;
  }

  /** Создаёт заявку на аренду */
  async create(tenantId: number, dto: CreateApplicationDto) {
    if (new Date(dto.desiredEnd) <= new Date(dto.desiredStart)) {
      throw new BadRequestException(
        'Дата окончания должна быть позже даты начала',
      );
    }
    if (new Date(dto.desiredStart) < new Date(new Date().toDateString())) {
      throw new BadRequestException('Дата начала не может быть в прошлом');
    }

    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({
        where: { id: dto.unitId },
      });
      if (!unit || unit.status !== 'available') {
        throw new BadRequestException('Помещение недоступно для аренды');
      }

      return tx.application.create({
        data: {
          tenantId,
          unitId: dto.unitId,
          clientId: dto.clientId,
          desiredStart: new Date(dto.desiredStart),
          desiredEnd: new Date(dto.desiredEnd),
          comment: dto.comment,
          status: 'draft',
        },
      });
    });
  }

  /** Отправляет заявку на рассмотрение */
  async submit(id: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'submitted');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'submitted' },
    });
  }

  /** Берёт заявку в работу (статус «на рассмотрении») */
  async review(id: number, userId: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'under_review');
    return this.prisma.application.update({
      where: { id },
      data: {
        status: 'under_review',
        reviewedById: userId,
      },
    });
  }

  /** Одобряет заявку и резервирует помещение */
  async approve(id: number, userId: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'approved');

    // Резервируем помещение атомарно
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.unit.updateMany({
        where: { id: app.unitId, status: 'available' },
        data: { status: 'reserved' },
      });
      if (updated.count === 0) {
        throw new BadRequestException(
          'Помещение уже занято или зарезервировано',
        );
      }

      return tx.application.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
    });
  }

  /** Отклоняет заявку */
  async reject(id: number, userId: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'rejected');

    return this.prisma.application.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  }

  /** Переводит заявку в статус «договор отправлен» */
  async markContractSent(id: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'contract_sent');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'contract_sent' },
    });
  }

  /** Фиксирует подписание и переводит помещение в статус «арендовано» */
  async markSigned(id: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'signed');

    return this.prisma.$transaction(async (tx) => {
      await tx.unit.update({
        where: { id: app.unitId },
        data: { status: 'rented' },
      });

      return tx.application.update({
        where: { id },
        data: { status: 'signed' },
      });
    });
  }

  /** Активирует заявку */
  async activate(id: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'active');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'active' },
    });
  }
}
