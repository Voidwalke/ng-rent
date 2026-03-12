import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import { ClamavService } from '../common/services/clamav.service';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private minioClient: Minio.Client;
  private bucket: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private clamav: ClamavService,
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
      this.logger.warn(`MinIO недоступен: ${err.message}`);
    }
  }

  /** Загружает файл в хранилище и сохраняет запись */
  async upload(
    tenantId: number,
    userId: number,
    file: Express.Multer.File,
    entityType: string,
    entityId: number,
    category = 'other',
  ) {
    await this.clamav.scan(file.buffer, file.originalname);

    const ext = path.extname(file.originalname);
    const hash = crypto.randomBytes(8).toString('hex');
    const objectName = `${tenantId}/${entityType}/${entityId}/${hash}${ext}`;

    await this.minioClient.putObject(
      this.bucket,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    return this.prisma.document.create({
      data: {
        tenantId,
        entityType,
        entityId,
        fileName: file.originalname,
        fileUrl: objectName,
        fileSize: file.size,
        mimeType: file.mimetype,
        category,
        uploadedBy: userId,
      },
    });
  }

  /** Возвращает документы по сущности */
  async findByEntity(tenantId: number, entityType: string, entityId: number) {
    return this.prisma.document.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Возвращает все документы тенанта с пагинацией */
  async findAll(tenantId: number, page = 1, limit = 20, category?: string) {
    const where: any = { tenantId };
    if (category) where.category = category;

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, fullName: true } } },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Генерирует presigned URL для скачивания */
  async getDownloadUrl(tenantId: number, id: number): Promise<string> {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Документ не найден');

    return this.minioClient.presignedGetObject(this.bucket, doc.fileUrl, 3600);
  }

  /** Удаляет файл из хранилища и запись из БД */
  async remove(tenantId: number, id: number) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Документ не найден');

    await this.minioClient.removeObject(this.bucket, doc.fileUrl);
    await this.prisma.document.delete({ where: { id } });

    return { deleted: true };
  }
}
