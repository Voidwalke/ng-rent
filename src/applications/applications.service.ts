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

  async findAll(tenantId: number) {
    return this.prisma.application.findMany({
      where: { tenantId },
      include: {
        unit: {
          select: { id: true, floor: true, areaSqm: true, priceMonth: true },
        },
        client: { select: { id: true, companyName: true, contactName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const app = await this.prisma.application.findUnique({
      where: { id },
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
    // Проверяем что помещение свободно
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
    });
    if (!unit || unit.status !== 'available') {
      throw new BadRequestException('Помещение недоступно для аренды');
    }

    return this.prisma.application.create({
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
  }

  // Отправить заявку на рассмотрение
  async submit(id: number) {
    const app = await this.findOne(id);
    validateTransition(app.status, 'submitted');
    return this.prisma.application.update({
      where: { id },
      data: { status: 'submitted' },
    });
  }

  // Взять в работу
  async review(id: number, userId: number) {
    const app = await this.findOne(id);
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
  async approve(id: number, userId: number) {
    const app = await this.findOne(id);
    validateTransition(app.status, 'approved');

    // Резервируем помещение
    await this.prisma.unit.update({
      where: { id: app.unitId },
      data: { status: 'reserved' },
    });

    return this.prisma.application.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  }

  // Отклонить
  async reject(id: number, userId: number) {
    const app = await this.findOne(id);
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
  async markSigned(id: number) {
    const app = await this.findOne(id);
    validateTransition(app.status, 'signed');

    await this.prisma.unit.update({
      where: { id: app.unitId },
      data: { status: 'rented' },
    });

    return this.prisma.application.update({
      where: { id },
      data: { status: 'signed' },
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
