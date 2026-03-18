import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { FilterUnitDto } from './dto/filter-unit.dto';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number, filter: FilterUnitDto) {
    const where: Prisma.UnitWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (filter.propertyId) where.propertyId = filter.propertyId;
    if (filter.status) where.status = filter.status;
    if (filter.floor) where.floor = filter.floor;
    if (filter.minArea)
      where.areaSqm = { ...(where.areaSqm as any), gte: filter.minArea };
    if (filter.maxArea)
      where.areaSqm = { ...(where.areaSqm as any), lte: filter.maxArea };
    if (filter.maxPrice) where.priceMonth = { lte: filter.maxPrice };

    const page = filter.page || 1;
    const limit = filter.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { property: { select: { name: true, address: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Публичный каталог — только опубликованные и доступные */
  async findCatalog(filter: FilterUnitDto) {
    const where: Prisma.UnitWhereInput = {
      status: 'available',
      deletedAt: null,
      property: { isPublished: true, deletedAt: null },
    };

    if (filter.minArea)
      where.areaSqm = { ...(where.areaSqm as any), gte: filter.minArea };
    if (filter.maxArea)
      where.areaSqm = { ...(where.areaSqm as any), lte: filter.maxArea };
    if (filter.maxPrice) where.priceMonth = { lte: filter.maxPrice };
    if (filter.floor) where.floor = filter.floor;

    const page = filter.page || 1;
    const limit = filter.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          property: {
            select: { name: true, address: true, type: true, city: true },
          },
        },
        orderBy: { priceMonth: 'asc' },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: number, tenantId?: number) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, ...(tenantId && { tenantId }), deletedAt: null },
      include: { property: true },
    });
    if (!unit || unit.deletedAt) {
      throw new NotFoundException('Помещение не найдено');
    }
    return unit;
  }

  async create(tenantId: number, dto: CreateUnitDto) {
    return this.prisma.unit.create({
      data: { ...dto, tenantId },
    });
  }

  async update(id: number, dto: UpdateUnitDto) {
    await this.findOne(id);
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  /** Перевести помещение на обслуживание */
  async setMaintenance(id: number) {
    const unit = await this.findOne(id);
    if (unit.status === 'rented') {
      throw new BadRequestException(
        'Нельзя перевести арендованное помещение на обслуживание',
      );
    }
    return this.prisma.unit.update({
      where: { id },
      data: { status: 'maintenance' },
    });
  }

  /** Вернуть помещение из обслуживания */
  async setAvailable(id: number) {
    const unit = await this.findOne(id);
    if (unit.status !== 'maintenance') {
      throw new BadRequestException('Помещение не на обслуживании');
    }
    return this.prisma.unit.update({
      where: { id },
      data: { status: 'available' },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.unit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
