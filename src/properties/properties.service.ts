import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import * as path from 'path';

const CACHE_TTL = 600; // 10 минут

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);
  private minioClient: Minio.Client;
  private bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'documents');

    this.minioClient = new Minio.Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.config.get<number>('MINIO_PORT', 9000)),
      useSSL: this.config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });

    void this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.minioClient.bucketExists(this.bucket);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucket);
        this.logger.log(`Бакет "${this.bucket}" создан`);
      }
    } catch (err) {
      this.logger.warn(`MinIO недоступен: ${(err as Error).message}`);
    }
  }

  /** Возвращает список объектов недвижимости арендатора с фильтрацией */
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

  /** Возвращает объект недвижимости по идентификатору */
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

  /** Создаёт новый объект недвижимости */
  async create(tenantId: number, dto: CreatePropertyDto) {
    const result = await this.prisma.property.create({
      data: { ...dto, tenantId },
    });
    await this.invalidateCache(tenantId);
    return result;
  }

  /** Обновляет данные объекта недвижимости */
  async update(id: number, dto: UpdatePropertyDto, tenantId?: number) {
    await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: dto,
    });
    await this.invalidateCache(result.tenantId, id);
    return result;
  }

  /** Публикует объект в каталоге */
  async publish(id: number, tenantId?: number) {
    const prop = await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: { isPublished: true },
    });
    await this.invalidateCache(prop.tenantId, id);
    return result;
  }

  /** Снимает объект с публикации */
  async unpublish(id: number, tenantId?: number) {
    const prop = await this.findOne(id, tenantId);
    const result = await this.prisma.property.update({
      where: { id },
      data: { isPublished: false },
    });
    await this.invalidateCache(prop.tenantId, id);
    return result;
  }

  /** Возвращает статистику по объекту — занятость */
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

  /** Удаляет объект недвижимости (мягкое удаление) */
  async remove(id: number, tenantId?: number) {
    const prop = await this.findOne(id, tenantId);

    // Блокировка удаления при наличии активных договоров
    const activeContracts = await this.prisma.contract.count({
      where: {
        unit: { propertyId: id },
        status: { in: ['draft', 'sent', 'signed', 'active'] },
      },
    });
    if (activeContracts > 0) {
      throw new BadRequestException(
        `Нельзя удалить объект: есть активные договоры (${activeContracts})`,
      );
    }

    const result = await this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.invalidateCache(prop.tenantId, id);
    return result;
  }

  /** Загружает фото объекта в MinIO и сохраняет URL */
  async uploadImage(
    id: number,
    tenantId: number,
    file: Express.Multer.File,
  ) {
    const property = await this.findOne(id, tenantId);

    const ext = path.extname(file.originalname);
    const hash = crypto.randomBytes(8).toString('hex');
    const objectName = `${tenantId}/properties/${id}/${hash}${ext}`;

    await this.minioClient.putObject(
      this.bucket,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    // Build public URL for the uploaded image
    const useSSL =
      this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = Number(this.config.get<number>('MINIO_PORT', 9000));
    const imageUrl = `${protocol}://${endpoint}:${port}/${this.bucket}/${objectName}`;

    const result = await this.prisma.property.update({
      where: { id },
      data: { imageUrl },
    });

    await this.invalidateCache(property.tenantId, id);
    return result;
  }

  /** Возвращает все изображения галереи объекта */
  async getImages(propertyId: number, tenantId: number) {
    await this.findOne(propertyId, tenantId);
    return this.prisma.propertyImage.findMany({
      where: { propertyId, tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Добавляет изображение в галерею объекта (загрузка в MinIO + запись) */
  async addImage(
    propertyId: number,
    tenantId: number,
    file: Express.Multer.File,
    caption?: string,
  ) {
    await this.findOne(propertyId, tenantId);

    const ext = path.extname(file.originalname);
    const hash = crypto.randomBytes(8).toString('hex');
    const objectName = `${tenantId}/properties/${propertyId}/gallery/${hash}${ext}`;

    await this.minioClient.putObject(
      this.bucket,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    const useSSL =
      this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = Number(this.config.get<number>('MINIO_PORT', 9000));
    const imageUrl = `${protocol}://${endpoint}:${port}/${this.bucket}/${objectName}`;

    const maxSort = await this.prisma.propertyImage.aggregate({
      where: { propertyId },
      _max: { sortOrder: true },
    });

    const result = await this.prisma.propertyImage.create({
      data: {
        tenantId,
        propertyId,
        imageUrl,
        caption: caption || null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    await this.invalidateCache(tenantId, propertyId);
    return result;
  }

  /** Меняет порядок изображения в галерее (вверх/вниз) */
  async reorderImage(
    propertyId: number,
    imageId: number,
    direction: 'up' | 'down',
    tenantId: number,
  ) {
    await this.findOne(propertyId, tenantId);

    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId, tenantId },
      orderBy: { sortOrder: 'asc' },
    });

    const idx = images.findIndex((img) => img.id === imageId);
    if (idx === -1) {
      throw new NotFoundException('Изображение не найдено');
    }

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= images.length) {
      throw new BadRequestException('Невозможно переместить: изображение уже на краю');
    }

    const current = images[idx];
    const neighbor = images[swapIdx];

    await this.prisma.$transaction([
      this.prisma.propertyImage.update({
        where: { id: current.id },
        data: { sortOrder: neighbor.sortOrder },
      }),
      this.prisma.propertyImage.update({
        where: { id: neighbor.id },
        data: { sortOrder: current.sortOrder },
      }),
    ]);

    await this.invalidateCache(tenantId, propertyId);
    return { reordered: true };
  }

  /** Удаляет изображение из галереи */
  async deleteImage(propertyId: number, imageId: number, tenantId: number) {
    await this.findOne(propertyId, tenantId);

    const image = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId, tenantId },
    });
    if (!image) {
      throw new NotFoundException('Изображение не найдено');
    }

    // Try to remove from MinIO (ignore errors — file may not exist)
    try {
      const url = new URL(image.imageUrl);
      const objectName = url.pathname.replace(`/${this.bucket}/`, '');
      await this.minioClient.removeObject(this.bucket, objectName);
    } catch (err) {
      this.logger.warn(`Не удалось удалить файл из MinIO: ${(err as Error).message}`);
    }

    await this.prisma.propertyImage.delete({ where: { id: imageId } });
    await this.invalidateCache(tenantId, propertyId);
    return { deleted: true };
  }

  /** Инвалидирует кэш объектов */
  private async invalidateCache(tenantId: number, propertyId?: number) {
    await this.redis.delByPattern(`properties:list:${tenantId}:*`);
    if (propertyId) {
      await this.redis.del(`properties:${propertyId}`);
      await this.redis.del(`properties:stats:${propertyId}`);
    }
  }
}
