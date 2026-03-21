import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Парсит CSV-строку с учётом кавычек */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Парсит CSV-содержимое в массив объектов */
function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  /** Временное хранилище CSV-данных между createJob и confirmImport */
  private pendingFiles = new Map<number, string>();

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

    const fileContent = file.buffer?.toString('utf-8') || '';
    const { headers, rows } = parseCsv(fileContent);

    if (rows.length === 0) {
      throw new BadRequestException('Файл пуст или не содержит данных');
    }

    const job = await this.prisma.importJob.create({
      data: {
        tenantId,
        type,
        fileUrl: `imports/${tenantId}/${Date.now()}_${file.originalname}`,
        status: 'preview',
        totalRows: rows.length,
        importedRows: 0,
        errorRows: 0,
        uploadedBy: userId,
      },
    });

    // Сохраняем содержимое для последующего импорта
    this.pendingFiles.set(job.id, fileContent);

    this.logger.log(
      `Импорт ${type}: загружен файл, ${rows.length} строк, заголовки: ${headers.join(', ')}`,
    );
    return { ...job, preview: { headers, sampleRows: rows.slice(0, 5) } };
  }

  /** Подтверждает и выполняет импорт */
  async confirmImport(tenantId: number, importId: number) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: importId, tenantId, status: 'preview' },
    });
    if (!job) throw new NotFoundException('Задача импорта не найдена');

    const fileContent = this.pendingFiles.get(importId);
    if (!fileContent) {
      throw new BadRequestException(
        'Данные файла не найдены, загрузите файл заново',
      );
    }

    await this.prisma.importJob.update({
      where: { id: importId },
      data: { status: 'importing' },
    });

    const { rows } = parseCsv(fileContent);
    let importedRows = 0;
    let errorRows = 0;
    const errors: { row: number; error: string }[] = [];

    if (job.type === 'clients') {
      for (let i = 0; i < rows.length; i++) {
        try {
          const [
            companyName,
            inn,
            kpp,
            contactName,
            contactEmail,
            contactPhone,
          ] = rows[i];
          if (!companyName || !contactName || !contactEmail) {
            throw new Error('Обязательные поля: Компания, Контакт, Email');
          }
          await this.prisma.client.create({
            data: {
              tenantId,
              companyName,
              inn: inn || null,
              kpp: kpp || null,
              contactName,
              contactEmail,
              contactPhone: contactPhone || null,
            },
          });
          importedRows++;
        } catch (err: any) {
          errorRows++;
          errors.push({ row: i + 2, error: err.message });
        }
      }
    } else if (job.type === 'units') {
      for (let i = 0; i < rows.length; i++) {
        try {
          const [
            propertyName,
            unitNumber,
            floor,
            areaSqm,
            priceMonth,
            status,
            description,
          ] = rows[i];
          if (!propertyName || !floor || !areaSqm || !priceMonth) {
            throw new Error('Обязательные поля: Объект, Этаж, Площадь, Цена');
          }

          // Находим объект по названию
          const property = await this.prisma.property.findFirst({
            where: { tenantId, name: propertyName, deletedAt: null },
          });
          if (!property) {
            throw new Error(`Объект «${propertyName}» не найден`);
          }

          const validStatuses = [
            'available',
            'rented',
            'maintenance',
            'reserved',
          ];
          const unitStatus = validStatuses.includes(status)
            ? status
            : 'available';

          await this.prisma.unit.create({
            data: {
              tenantId,
              propertyId: property.id,
              unitNumber: unitNumber || null,
              floor: parseInt(floor, 10),
              areaSqm: parseFloat(areaSqm),
              priceMonth: parseFloat(priceMonth),
              status: unitStatus as any,
              description: description || null,
            },
          });
          importedRows++;
        } catch (err: any) {
          errorRows++;
          errors.push({ row: i + 2, error: err.message });
        }
      }
    } else if (job.type === 'contracts') {
      for (let i = 0; i < rows.length; i++) {
        try {
          const [
            contractNumber,
            clientInn,
            unitNumber,
            startDate,
            endDate,
            monthlyRent,
          ] = rows[i];
          if (
            !contractNumber ||
            !clientInn ||
            !startDate ||
            !endDate ||
            !monthlyRent
          ) {
            throw new Error(
              'Обязательные поля: Номер договора, Компания (ИНН), Дата начала, Дата окончания, Ставка',
            );
          }

          const client = await this.prisma.client.findFirst({
            where: { tenantId, inn: clientInn },
          });
          if (!client) {
            throw new Error(`Клиент с ИНН ${clientInn} не найден`);
          }

          // Ищем помещение по номеру (если указан)
          let unit: any = null;
          if (unitNumber) {
            unit = await this.prisma.unit.findFirst({
              where: { tenantId, unitNumber, deletedAt: null },
            });
            if (!unit) {
              throw new Error(`Помещение «${unitNumber}» не найдено`);
            }
          }

          // Создаём заявку-заглушку для связи
          const application = await this.prisma.application.create({
            data: {
              tenantId,
              unitId: unit?.id || 0,
              clientId: client.id,
              desiredStart: new Date(startDate),
              desiredEnd: new Date(endDate),
              status: 'active',
            },
          });

          await this.prisma.contract.create({
            data: {
              tenantId,
              applicationId: application.id,
              clientId: client.id,
              unitId: unit?.id || 0,
              contractNumber,
              startDate: new Date(startDate),
              endDate: new Date(endDate),
              monthlyRent: parseFloat(monthlyRent),
              status: 'active',
            },
          });
          importedRows++;
        } catch (err: any) {
          errorRows++;
          errors.push({ row: i + 2, error: err.message });
        }
      }
    }

    // Очищаем временные данные
    this.pendingFiles.delete(importId);

    await this.prisma.importJob.update({
      where: { id: importId },
      data: {
        status: errorRows > 0 ? 'completed_with_errors' : 'completed',
        importedRows,
        errorRows,
        errors: errors.length > 0 ? errors : undefined,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Импорт ${job.type}: ${importedRows}/${rows.length} строк, ошибок: ${errorRows}`,
    );

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
