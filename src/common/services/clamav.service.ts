import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

/** Сервис антивирусной проверки файлов через ClamAV */
@Injectable()
export class ClamavService {
  private readonly logger = new Logger(ClamavService.name);
  private readonly host: string;
  private readonly port: number;
  private readonly enabled: boolean;
  private readonly maxFileSize = 25 * 1024 * 1024; // 25 MB (clamd StreamMaxLength)
  private readonly chunkSize = 2048; // размер чанка для INSTREAM

  constructor(private config: ConfigService) {
    this.host = this.config.get<string>('CLAMAV_HOST', 'localhost');
    this.port = Number(this.config.get('CLAMAV_PORT', 3310));
    this.enabled =
      this.config.get<string>('CLAMAV_ENABLED', 'false') === 'true';
  }

  /** Проверяет буфер файла на вирусы через clamd */
  async scan(buffer: Buffer, filename: string): Promise<void> {
    if (!this.enabled) return;

    if (buffer.length > this.maxFileSize) {
      throw new BadRequestException(
        `Файл "${filename}" превышает лимит ${this.maxFileSize / 1024 / 1024} МБ`,
      );
    }

    let result: string;
    try {
      result = await this.sendToClam(buffer);
    } catch (err: any) {
      this.logger.error(`ClamAV недоступен: ${err?.message}`);
      throw new ServiceUnavailableException(
        'Антивирусная проверка временно недоступна, загрузка отклонена',
      );
    }

    if (result.includes('FOUND')) {
      const threat =
        result.split(':')[1]?.trim().replace(' FOUND', '') || 'unknown';
      this.logger.warn(`Обнаружена угроза в "${filename}": ${threat}`);
      throw new BadRequestException(
        `Файл "${filename}" содержит угрозу: ${threat}`,
      );
    }

    if (result.includes('ERROR')) {
      this.logger.error(`ClamAV вернул ошибку: ${result}`);
      throw new ServiceUnavailableException(
        'Ошибка антивирусной проверки, загрузка отклонена',
      );
    }

    this.logger.debug(`Файл "${filename}" проверен — чисто`);
  }

  /** Отправляет данные в clamd через INSTREAM-протокол (чанками) */
  private sendToClam(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) {
          reject(err);
        } else {
          resolve(Buffer.concat(chunks).toString().trim());
        }
      };

      socket.connect(this.port, this.host, () => {
        // Команда zINSTREAM (null-terminated)
        socket.write('zINSTREAM\0');

        // Отправляем данные чанками
        for (let offset = 0; offset < buffer.length; offset += this.chunkSize) {
          const end = Math.min(offset + this.chunkSize, buffer.length);
          const chunk = buffer.subarray(offset, end);
          const sizeBuffer = Buffer.alloc(4);
          sizeBuffer.writeUInt32BE(chunk.length, 0);
          socket.write(sizeBuffer);
          socket.write(chunk);
        }

        // Завершающий нулевой чанк
        const endBuffer = Buffer.alloc(4);
        endBuffer.writeUInt32BE(0, 0);
        socket.write(endBuffer);
      });

      socket.on('data', (data) => chunks.push(data));
      socket.on('end', () => finish());
      socket.on('error', (err) => finish(err));
      socket.setTimeout(30000, () =>
        finish(new Error('Таймаут соединения с ClamAV')),
      );
    });
  }
}
