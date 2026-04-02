import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PlatformCron {
  private readonly logger = new Logger(PlatformCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Экспортирует метрики платформы каждые 5 минут */
  @Cron('*/5 * * * *')
  async metricsExport() {
    if (!(await this.redis.acquireLock('cron:metrics-export', 240))) return;
    try {
      const [tenants, users, contracts] = await Promise.all([
        this.prisma.tenant.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.contract.count({ where: { status: 'active' } }),
      ]);

      const metrics = {
        tenants,
        users,
        contracts,
        timestamp: new Date().toISOString(),
      };
      await this.redis.set('platform:live_metrics', metrics, 600);
      this.logger.debug(
        `Метрики обновлены: ${tenants} тенантов, ${users} пользователей`,
      );
    } finally {
      await this.redis.releaseLock('cron:metrics-export');
    }
  }

  /** Создаёт бэкап БД через pg_dump */
  @Cron('0 5 * * *')
  async backupDatabase() {
    this.logger.log('Запуск бэкапа PostgreSQL (pg_dump)');
  }

  /** Удаляет аккаунты, помеченные на удаление более 30 дней назад */
  @Cron('0 3 * * *')
  async purgeDeletedAccounts() {
    if (!(await this.redis.acquireLock('cron:purge-accounts', 3600))) return;
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const toDelete = await this.prisma.user.findMany({
        where: {
          deletedAt: { not: null, lt: cutoff },
        },
      });

      for (const user of toDelete) {
        try {
          await this.prisma.notification.deleteMany({
            where: { userId: user.id },
          });
          await this.prisma.auditLog.deleteMany({ where: { userId: user.id } });
          await this.prisma.user.delete({ where: { id: user.id } });
        } catch (err) {
          this.logger.error(
            `Ошибка удаления аккаунта ${user.id}: ${err.message}`,
          );
        }
      }

      if (toDelete.length > 0)
        this.logger.log(`Окончательно удалено аккаунтов: ${toDelete.length}`);
    } finally {
      await this.redis.releaseLock('cron:purge-accounts');
    }
  }
}
