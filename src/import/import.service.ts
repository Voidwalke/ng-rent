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

    // TODO: парсинг файла через exceljs и валидация строк
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'preview', totalRows: 100 },
    });

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

    // TODO: реальная обработка строк из файла
    this.logger.log(
      `Импорт ${job.type}: ${job.totalRows} строк для tenant ${tenantId}`,
    );

    await this.prisma.importJob.update({
      where: { id: importId },
      data: {
        status: 'completed',
        importedRows: job.totalRows,
        completedAt: new Date(),
      },
    });

    return { status: 'completed', imported: job.totalRows };
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
