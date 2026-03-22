import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Допустимые переходы статусов заявки на ремонт */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список заявок на ремонт с фильтрацией */
  async findAll(
    tenantId: number,
    filters?: {
      status?: string;
      propertyId?: number;
      page?: number;
      limit?: number;
    },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.propertyId) where.unit = { propertyId: filters.propertyId };

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);

    const [data, total] = await Promise.all([
      this.prisma.maintenanceRequest.findMany({
        where,
        include: {
          unit: {
            select: {
              unitNumber: true,
              floor: true,
              property: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.maintenanceRequest.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Возвращает заявку на ремонт по идентификатору */
  async findOne(id: number, tenantId: number) {
    const req = await this.prisma.maintenanceRequest.findFirst({
      where: { id, tenantId },
      include: {
        unit: {
          include: { property: { select: { name: true, address: true } } },
        },
      },
    });
    if (!req) throw new NotFoundException('Заявка на ремонт не найдена');
    return req;
  }

  /** Создаёт заявку на ремонт */
  async create(tenantId: number, userId: number, dto: any) {
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

  /** Обновляет заявку на ремонт */
  async update(id: number, tenantId: number, dto: any) {
    const existing = await this.findOne(id, tenantId);

    // Валидация переходов статусов
    if (dto.status && dto.status !== existing.status) {
      const allowed = STATUS_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Нельзя перевести заявку из "${existing.status}" в "${dto.status}"`,
        );
      }
    }

    const data: any = { ...dto };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.status === 'completed') data.completedAt = new Date();
    return this.prisma.maintenanceRequest.update({ where: { id }, data });
  }

  /** Удаляет заявку на ремонт */
  async remove(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.prisma.maintenanceRequest.delete({ where: { id } });
    return { message: 'Заявка удалена' };
  }
}
