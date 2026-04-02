import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

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

/** Результат парсинга файла (CSV или XLSX) */
interface ParsedFile {
  headers: string[];
  rows: string[][];
}

/** Парсит XLSX/XLS-буфер: берёт первый лист и возвращает заголовки + строки */
function parseXlsx(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const jsonRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (jsonRows.length === 0) return { headers: [], rows: [] };

  const headers = jsonRows[0].map((h: unknown) => String(h ?? '').trim());
  const rows = jsonRows
    .slice(1)
    .filter((r) => r.some((cell: unknown) => String(cell ?? '').trim() !== ''))
    .map((r) => r.map((cell: unknown) => String(cell ?? '').trim()));

  return { headers, rows };
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  /** Временное хранилище разобранных данных между createJob и confirmImport */
  private pendingFiles = new Map<number, ParsedFile>();
  /** TTL для pendingFiles — 30 минут */
  private readonly PENDING_TTL = 30 * 60 * 1000;

  constructor(private prisma: PrismaService) {}

  /** Сохраняет разобранный файл с автоочисткой по таймауту */
  private setPendingFile(jobId: number, data: ParsedFile) {
    this.pendingFiles.set(jobId, data);
    setTimeout(() => {
      if (this.pendingFiles.has(jobId)) {
        this.pendingFiles.delete(jobId);
        this.logger.debug(`Pending file for job ${jobId} expired (TTL)`);
      }
    }, this.PENDING_TTL);
  }

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

    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    let headers: string[];
    let rows: string[][];

    if (ext === 'xlsx' || ext === 'xls') {
      const parsed = parseXlsx(file.buffer);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      const fileContent = file.buffer?.toString('utf-8') || '';
      const parsed = parseCsv(fileContent);
      headers = parsed.headers;
      rows = parsed.rows;
    }

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

    // Сохранение разобранных данных для последующего импорта
    this.setPendingFile(job.id, { headers, rows });

    // Предварительная валидация строк
    const rowErrors = this.validateRows(type, rows);
    const errorCount = rowErrors.filter((e) => e !== null).length;

    this.logger.log(
      `Импорт ${type}: загружен файл, ${rows.length} строк (${errorCount} с ошибками), заголовки: ${headers.join(', ')}`,
    );
    return {
      ...job,
      preview: {
        headers,
        rows: rows.slice(0, 50),
        rowErrors: rowErrors.slice(0, 50),
        totalRows: rows.length,
        errorCount,
      },
    };
  }

  /** Валидирует строки и возвращает массив ошибок (null = ок) */
  private validateRows(
    type: string,
    rows: string[][],
  ): (string | null)[] {
    return rows.map((row) => {
      try {
        if (type === 'units') {
          const [propertyName, , floor, areaSqm, priceMonth] = row;
          const missing: string[] = [];
          if (!propertyName) missing.push('Объект');
          if (!floor) missing.push('Этаж');
          if (!areaSqm) missing.push('Площадь');
          if (!priceMonth) missing.push('Цена');
          if (missing.length > 0)
            return `Не заполнены обязательные поля: ${missing.join(', ')}`;
          if (isNaN(parseInt(floor, 10))) return 'Этаж должен быть числом';
          if (isNaN(parseFloat(areaSqm))) return 'Площадь должна быть числом';
          if (isNaN(parseFloat(priceMonth)))
            return 'Цена должна быть числом';
        } else if (type === 'clients') {
          const [companyName, , , contactName, contactEmail] = row;
          const missing: string[] = [];
          if (!companyName) missing.push('Компания');
          if (!contactName) missing.push('Контакт');
          if (!contactEmail) missing.push('Email');
          if (missing.length > 0)
            return `Не заполнены обязательные поля: ${missing.join(', ')}`;
          if (contactEmail && !contactEmail.includes('@'))
            return 'Некорректный email';
        } else if (type === 'contracts') {
          const [contractNumber, clientInn, , startDate, endDate, monthlyRent] =
            row;
          const missing: string[] = [];
          if (!contractNumber) missing.push('Номер договора');
          if (!clientInn) missing.push('Компания (ИНН)');
          if (!startDate) missing.push('Дата начала');
          if (!endDate) missing.push('Дата окончания');
          if (!monthlyRent) missing.push('Ставка');
          if (missing.length > 0)
            return `Не заполнены обязательные поля: ${missing.join(', ')}`;
          if (isNaN(parseFloat(monthlyRent)))
            return 'Ставка должна быть числом';
        }
        return null;
      } catch {
        return 'Ошибка валидации строки';
      }
    });
  }

  /** Подтверждает и выполняет импорт */
  async confirmImport(tenantId: number, importId: number) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: importId, tenantId, status: 'preview' },
    });
    if (!job) throw new NotFoundException('Задача импорта не найдена');

    const parsedData = this.pendingFiles.get(importId);
    if (!parsedData) {
      throw new BadRequestException(
        'Данные файла не найдены, загрузите файл заново',
      );
    }

    await this.prisma.importJob.update({
      where: { id: importId },
      data: { status: 'importing' },
    });

    const { rows } = parsedData;
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

          // Поиск объекта по названию
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

          // Поиск помещения по номеру (если указан)
          let unit: any = null;
          if (unitNumber) {
            unit = await this.prisma.unit.findFirst({
              where: { tenantId, unitNumber, deletedAt: null },
            });
            if (!unit) {
              throw new Error(`Помещение «${unitNumber}» не найдено`);
            }
          }

          if (!unit) {
            throw new Error('Помещение обязательно для импорта договора');
          }

          // Заявка-заглушка для связи с договором
          const application = await this.prisma.application.create({
            data: {
              tenantId,
              unitId: unit.id,
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
              unitId: unit.id,
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

    // Очистка временных данных
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

  /** Возвращает XLSX-буфер шаблона для указанного типа */
  getTemplate(type: string): { fileName: string; buffer: Buffer } {
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

    const cols = headers[type];
    if (!cols || cols.length === 0) {
      throw new BadRequestException(`Неизвестный тип шаблона: ${type}`);
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([cols]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон');

    const xlsxBuffer: Buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    return { fileName: `template_${type}.xlsx`, buffer: xlsxBuffer };
  }

  /** Возвращает список задач импорта тенанта */
  async findAll(tenantId: number) {
    return this.prisma.importJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
