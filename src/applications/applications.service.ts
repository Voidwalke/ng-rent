import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { validateTransition } from './state-machine';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
  ) {}

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

    const application = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: dto.unitId, tenantId, deletedAt: null },
        include: { property: { select: { name: true } } },
      });
      if (!unit || unit.status !== 'available') {
        throw new BadRequestException('Помещение недоступно для аренды');
      }

      const client = await tx.client.findFirst({
        where: { id: dto.clientId, tenantId, deletedAt: null },
      });
      if (!client) {
        throw new NotFoundException('Клиент не найден');
      }

      const app = await tx.application.create({
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

      return { app, unit, client };
    });

    // Уведомление менеджеров о новой заявке
    try {
      await this.notifications.notifyManagers(
        tenantId,
        'application_submitted',
        'Новая заявка на аренду',
        `Заявка №${application.app.id} от ${application.client.companyName || application.client.contactName}`,
        { applicationId: application.app.id },
      );
    } catch (err: any) {
      this.logger.error(`Ошибка уведомления менеджеров (create #${application.app.id}): ${err.message}`);
    }

    return application.app;
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

    // Резервирование помещения атомарно
    const result = await this.prisma.$transaction(async (tx) => {
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

    // Email клиенту об одобрении заявки
    try {
      const email = app.client?.contactEmail;
      if (email) {
        await this.mailer.send(
          email,
          `Заявка №${id} одобрена — договор готовится`,
          'contract-ready',
          {
            contractNumber: `Заявка №${id}`,
            propertyName: app.unit?.property?.name || '',
            unitNumber: app.unit?.unitNumber || `#${app.unitId}`,
          },
        );
      }
    } catch (err: any) {
      this.logger.error(`Ошибка отправки email (approve #${id}): ${err.message}`);
    }

    return result;
  }

  /** Отклоняет заявку */
  async reject(
    id: number,
    userId: number,
    tenantId?: number,
    rejectionReason?: string,
  ) {
    const app = await this.findOne(id, tenantId);
    validateTransition(app.status, 'rejected');

    const result = await this.prisma.application.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedById: userId,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || null,
      },
    });

    // Email клиенту об отклонении заявки
    try {
      const email = app.client?.contactEmail;
      if (email) {
        await this.mailer.send(
          email,
          `Заявка №${id} отклонена`,
          'application-rejected',
          {
            applicationId: id,
            propertyName: app.unit?.property?.name || '',
            unitNumber: app.unit?.unitNumber || `#${app.unitId}`,
            rejectionReason: rejectionReason || null,
          },
        );
      }
    } catch (err: any) {
      this.logger.error(`Ошибка отправки email (reject #${id}): ${err.message}`);
    }

    return result;
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
