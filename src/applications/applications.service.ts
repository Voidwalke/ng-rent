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

  async create(tenantId: number, dto: CreateApplicationDto) {
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

  // Отправить заявку на рассмотрение
  async submit(id: number, tenantId?: number) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'submitted');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'submitted' },
    });
  }

  // Взять в работу
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

  // Одобрить — потом через очередь сгенерится договор
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

  // Отклонить
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

  // Перевести в статус "договор отправлен"
  async markContractSent(id: number) {
    const app = await this.findOne(id);
    validateTransition(app.status, 'contract_sent');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'contract_sent' },
    });
  }

  // Подписан — активируем аренду
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

  async activate(id: number) {
    const app = await this.findOne(id);
    validateTransition(app.status, 'active');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'active' },
    });
  }
}
