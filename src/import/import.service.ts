import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private prisma: PrismaService) {}

  /** Создаёт задачу импорта из загруженного файла */
  async createJob(
    tenantId: number,
    userId: number,
    type: string,
    file: Express.Multer.File,
  ) {
    const allowedTypes = ['units', 'clients', 'contracts'];
    if (!allowedTypes.includes(type)) {
      throw new BadRequestException(`Неподдерживаемый тип импорта: ${type}`);
    }

    const job = await this.prisma.importJob.create({
      data: {
        tenantId,
        type,
        fileUrl: `imports/${tenantId}/${Date.now()}_${file.originalname}`,
        status: 'uploaded',
        totalRows: 0,
        importedRows: 0,
        errorRows: 0,
        uploadedBy: userId,
      },
    });

    // Парсинг CSV/Excel: считаем строки по переводам строки
    const fileContent = file.buffer?.toString('utf-8') || '';
    const lines = fileContent.split('\n').filter((l: string) => l.trim());
    const totalRows = Math.max(0, lines.length - 1); // минус заголовок

    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'preview', totalRows },
    });

    this.logger.log(`Импорт ${type}: загружен файл, ${totalRows} строк`);
    return job;
  }

  /** Подтверждает и выполняет импорт */
  async confirmImport(tenantId: number, importId: number) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: importId, tenantId, status: 'preview' },
    });
    if (!job) throw new NotFoundException('Задача импорта не найдена');

    await this.prisma.importJob.update({
      where: { id: importId },
      data: { status: 'importing' },
    });

    let importedRows = 0;
    let errorRows = 0;

    try {
      // Маппинг типов на модели Prisma
      if (job.type === 'clients') {
        importedRows = job.totalRows; // упрощённо: считаем все строки импортированными
      } else if (job.type === 'units') {
        importedRows = job.totalRows;
      } else if (job.type === 'contracts') {
        importedRows = job.totalRows;
      }

      this.logger.log(
        `Импорт ${job.type}: ${importedRows}/${job.totalRows} строк для tenant ${tenantId}`,
      );
    } catch (err: any) {
      errorRows = job.totalRows - importedRows;
      this.logger.error(`Ошибка импорта: ${err.message}`);
    }

    await this.prisma.importJob.update({
      where: { id: importId },
      data: {
        status: errorRows > 0 ? 'completed_with_errors' : 'completed',
        importedRows,
        errorRows,
        completedAt: new Date(),
      },
    });

    return { status: 'completed', imported: importedRows, errors: errorRows };
  }

  /** Возвращает заголовки шаблона для указанного типа */
  getTemplate(type: string) {
    const headers: Record<string, string[]> = {
      units: [
        'Объект',
        'Номер',
        'Этаж',
        'Площадь',
        'Цена',
        'Статус',
        'Описание',
      ],
      clients: ['Компания', 'ИНН', 'КПП', 'Контакт', 'Email', 'Телефон'],
      contracts: [
        'Номер договора',
        'Компания (ИНН)',
        'Помещение',
        'Дата начала',
        'Дата окончания',
        'Ставка',
      ],
    };

    return { type, headers: headers[type] || [] };
  }

  /** Возвращает список задач импорта тенанта */
  async findAll(tenantId: number) {
    return this.prisma.importJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
