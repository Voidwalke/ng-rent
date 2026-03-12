import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

/** Сервис антивирусной проверки файлов через ClamAV */
@Injectable()
export class ClamavService {
  private readonly logger = new Logger(ClamavService.name);
  private readonly host: string;
  private readonly port: number;
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    this.host = this.config.get<string>('CLAMAV_HOST', 'localhost');
    this.port = this.config.get<number>('CLAMAV_PORT', 3310);
    this.enabled =
      this.config.get<string>('CLAMAV_ENABLED', 'false') === 'true';
  }

  /** Проверяет буфер файла на вирусы через clamd */
  async scan(buffer: Buffer, filename: string): Promise<void> {
    if (!this.enabled) return;

    try {
      const result = await this.sendToClam(buffer);

      if (result.includes('FOUND')) {
        const threat =
          result.split(':')[1]?.trim().replace(' FOUND', '') || 'unknown';
        this.logger.warn(`Обнаружена угроза в "${filename}": ${threat}`);
        throw new BadRequestException(
          `Файл "${filename}" содержит угрозу: ${threat}`,
        );
      }

      this.logger.debug(`Файл "${filename}" проверен — чисто`);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`ClamAV недоступен: ${err.message}`);
    }
  }

  /** Отправляет данные в clamd через INSTREAM-протокол */
  private sendToClam(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];

      socket.connect(this.port, this.host, () => {
        socket.write('zINSTREAM\0');

        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32BE(buffer.length, 0);
        socket.write(sizeBuffer);
        socket.write(buffer);

        const endBuffer = Buffer.alloc(4);
        endBuffer.writeUInt32BE(0, 0);
        socket.write(endBuffer);
      });

      socket.on('data', (data) => chunks.push(data));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString().trim()));
      socket.on('error', reject);
      socket.setTimeout(30000, () => {
        socket.destroy();
        reject(new Error('Таймаут соединения с ClamAV'));
      });
    });
  }
}
