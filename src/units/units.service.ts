import { Injectable, NotFoundException } from '@nestjs/common';
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
    if (filter.minArea) where.areaSqm = { gte: filter.minArea };
    if (filter.maxPrice) where.priceMonth = { lte: filter.maxPrice };

    return this.prisma.unit.findMany({
      where,
      include: { property: { select: { name: true, address: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Публичный каталог — без авторизации
  async findCatalog(filter: FilterUnitDto) {
    const where: Prisma.UnitWhereInput = {
      status: 'available',
      deletedAt: null,
    };

    if (filter.minArea) where.areaSqm = { gte: filter.minArea };
    if (filter.maxPrice) where.priceMonth = { lte: filter.maxPrice };
    if (filter.floor) where.floor = filter.floor;

    return this.prisma.unit.findMany({
      where,
      include: {
        property: { select: { name: true, address: true, type: true } },
      },
      orderBy: { priceMonth: 'asc' },
    });
  }

  async findOne(id: number) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
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

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.unit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
