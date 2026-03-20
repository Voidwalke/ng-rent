import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

const CACHE_TTL = 600; // 10 минут

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(
    tenantId: number,
    filters?: { type?: string; city?: string; isPublished?: boolean },
  ) {
    const cacheKey = `properties:list:${tenantId}:${JSON.stringify(filters || {})}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const where: Prisma.PropertyWhereInput = { tenantId, deletedAt: null };

    if (filters?.type) where.type = filters.type as any;
    if (filters?.city) where.city = filters.city;
    if (filters?.isPublished !== undefined)
      where.isPublished = filters.isPublished;

    const result = await this.prisma.property.findMany({
      where,
      include: {
        _count: { select: { units: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.redis.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async findOne(id: number, tenantId?: number) {
    const cacheKey = `properties:${id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      if (tenantId && cached.tenantId !== tenantId)
        throw new NotFoundException('Объект не найден');
      return cached;
    }

    const property = await this.prisma.property.findFirst({
      where: { id, ...(tenantId && { tenantId }), deletedAt: null },
      include: { units: { where: { deletedAt: null } } },
    });
    if (!property) {
      throw new NotFoundException('Объект не найден');
    }

    await this.redis.set(cacheKey, property, CACHE_TTL);
    return property;
  }

  async create(tenantId: number, dto: CreatePropertyDto) {
    const result = await this.prisma.property.create({
      data: { ...dto, tenantId },
    });
    await this.invalidateCache(tenantId);
    return result;
  }

  async update(id: number, dto: UpdatePropertyDto, tenantId?: number) {
    await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: dto,
    });
    await this.invalidateCache(result.tenantId, id);
    return result;
  }

  /** Публикация объекта в каталоге */
  async publish(id: number, tenantId?: number) {
    const prop = await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: { isPublished: true },
    });
    await this.invalidateCache(prop.tenantId, id);
    return result;
  }

  /** Снятие с публикации */
  async unpublish(id: number, tenantId?: number) {
    const prop = await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: { isPublished: false },
    });
    await this.invalidateCache(prop.tenantId, id);
    return result;
  }

  /** Статистика по объекту — занятость */
  async getStats(id: number, tenantId?: number) {
    const cacheKey = `properties:stats:${id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    await this.findOne(id, tenantId);

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

    const result = {
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

    await this.redis.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async remove(id: number, tenantId?: number) {
    const prop = await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.invalidateCache(prop.tenantId, id);
    return result;
  }

  /** Инвалидация кэша объектов */
  private async invalidateCache(tenantId: number, propertyId?: number) {
    await this.redis.delByPattern(`properties:list:${tenantId}:*`);
    if (propertyId) {
      await this.redis.del(`properties:${propertyId}`);
      await this.redis.del(`properties:stats:${propertyId}`);
    }
  }
}
