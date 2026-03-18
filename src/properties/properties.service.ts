import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: number,
    filters?: { type?: string; city?: string; isPublished?: boolean },
  ) {
    const where: Prisma.PropertyWhereInput = { tenantId, deletedAt: null };

    if (filters?.type) where.type = filters.type as any;
    if (filters?.city) where.city = filters.city;
    if (filters?.isPublished !== undefined)
      where.isPublished = filters.isPublished;

    return this.prisma.property.findMany({
      where,
      include: {
        _count: { select: { units: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, tenantId?: number) {
    const property = await this.prisma.property.findFirst({
      where: { id, ...(tenantId && { tenantId }), deletedAt: null },
      include: { units: { where: { deletedAt: null } } },
    });
    if (!property || property.deletedAt) {
      throw new NotFoundException('Объект не найден');
    }
    return property;
  }

  async create(tenantId: number, dto: CreatePropertyDto) {
    return this.prisma.property.create({
      data: { ...dto, tenantId },
    });
  }

  async update(id: number, dto: UpdatePropertyDto) {
    await this.findOne(id);
    return this.prisma.property.update({ where: { id }, data: dto });
  }

  /** Публикация объекта в каталоге */
  async publish(id: number) {
    await this.findOne(id);
    return this.prisma.property.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  /** Снятие с публикации */
  async unpublish(id: number) {
    await this.findOne(id);
    return this.prisma.property.update({
      where: { id },
      data: { isPublished: false },
    });
  }

  /** Статистика по объекту — занятость */
  async getStats(id: number) {
    await this.findOne(id);

    const units = await this.prisma.unit.groupBy({
      by: ['status'],
      where: { propertyId: id, deletedAt: null },
      _count: true,
    });

    const totalArea = await this.prisma.unit.aggregate({
      where: { propertyId: id, deletedAt: null },
      _sum: { areaSqm: true },
    });

    const rentedArea = await this.prisma.unit.aggregate({
      where: { propertyId: id, deletedAt: null, status: 'rented' },
      _sum: { areaSqm: true },
    });

    return {
      unitsByStatus: units.reduce(
        (acc, u) => ({ ...acc, [u.status]: u._count }),
        {},
      ),
      totalArea: totalArea._sum.areaSqm || 0,
      rentedArea: rentedArea._sum.areaSqm || 0,
      occupancyRate: totalArea._sum.areaSqm
        ? Math.round(
            (Number(rentedArea._sum.areaSqm || 0) /
              Number(totalArea._sum.areaSqm)) *
              100,
          )
        : 0,
    };
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
