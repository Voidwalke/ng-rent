import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {
    this.client = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: Number(this.config.get('REDIS_PORT', 6379)),
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis: ${err.message}`);
    });

    this.client.connect().catch(() => {
      this.logger.warn('Redis недоступен, кэширование отключено');
    });
  }

  /** Возвращает значение из кэша по ключу */
  async get<T>(key: string): Promise<T | null> {
    try {
      const val = await this.client.get(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  /** Сохраняет значение в кэш с TTL */
  async set(key: string, value: any, ttlSeconds = 900): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* кэш недоступен */
    }
  }

  /** Удаляет ключ из кэша */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      /* ignore */
    }
  }

  /** Распределённая блокировка через SETNX. Возвращает true при успешном захвате */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return true; // Redis down → single-instance, allow execution
    }
  }

  /** Освобождает распределённую блокировку */
  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }

  /** Удаляет ключи из кэша по паттерну */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch {
      /* кэш недоступен */
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
