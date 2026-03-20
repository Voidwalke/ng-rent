import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { FilterUnitDto } from './dto/filter-unit.dto';

const CACHE_TTL = 600; // 10 минут

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(tenantId: number, filter: FilterUnitDto) {
    const cacheKey = `units:list:${tenantId}:${JSON.stringify(filter)}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

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

    const result = {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
    await this.redis.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  /** Публичный каталог — только опубликованные и доступные */
  async findCatalog(filter: FilterUnitDto) {
    const cacheKey = `units:catalog:${JSON.stringify(filter)}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

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

    const result = {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
    await this.redis.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async findOne(id: number, tenantId?: number) {
    const cacheKey = `units:${id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      if (tenantId && cached.tenantId !== tenantId)
        throw new NotFoundException('Помещение не найдено');
      return cached;
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id, ...(tenantId && { tenantId }), deletedAt: null },
      include: { property: true },
    });
    if (!unit) {
      throw new NotFoundException('Помещение не найдено');
    }

    await this.redis.set(cacheKey, unit, CACHE_TTL);
    return unit;
  }

  async create(tenantId: number, dto: CreateUnitDto) {
    const result = await this.prisma.unit.create({
      data: { ...dto, tenantId },
    });
    await this.invalidateCache(tenantId);
    return result;
  }

  async update(id: number, dto: UpdateUnitDto, tenantId?: number) {
    await this.findOne(id, tenantId);
    const result = await this.prisma.unit.update({ where: { id }, data: dto });
    await this.invalidateCache(result.tenantId, id);
    return result;
  }

  /** Перевести помещение на обслуживание */
  async setMaintenance(id: number, tenantId?: number) {
    const unit = await this.findOne(id, tenantId);
    if (unit.status === 'rented') {
      throw new BadRequestException(
        'Нельзя перевести арендованное помещение на обслуживание',
      );
    }
    const result = await this.prisma.unit.update({
      where: { id },
      data: { status: 'maintenance' },
    });
    await this.invalidateCache(unit.tenantId, id);
    return result;
  }

  /** Вернуть помещение из обслуживания */
  async setAvailable(id: number, tenantId?: number) {
    const unit = await this.findOne(id, tenantId);
    if (unit.status !== 'maintenance') {
      throw new BadRequestException('Помещение не на обслуживании');
    }
    const result = await this.prisma.unit.update({
      where: { id },
      data: { status: 'available' },
    });
    await this.invalidateCache(unit.tenantId, id);
    return result;
  }

  async remove(id: number, tenantId?: number) {
    const unit = await this.findOne(id, tenantId);
    const result = await this.prisma.unit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.invalidateCache(unit.tenantId, id);
    return result;
  }

  /** Инвалидация кэша помещений */
  private async invalidateCache(tenantId: number, unitId?: number) {
    await this.redis.delByPattern(`units:list:${tenantId}:*`);
    await this.redis.delByPattern('units:catalog:*');
    if (unitId) await this.redis.del(`units:${unitId}`);
  }
}
