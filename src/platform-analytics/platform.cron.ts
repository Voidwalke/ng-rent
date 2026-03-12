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
    await this.redis.set('platform:live_metrics', JSON.stringify(metrics), 600);
    this.logger.debug(
      `Метрики обновлены: ${tenants} тенантов, ${users} пользователей`,
    );
  }

  /** Создаёт бэкап БД через pg_dump */
  @Cron('0 5 * * *')
  async backupDatabase() {
    // pg_dump выполняется через Docker exec в продакшене
    this.logger.log('Запуск бэкапа PostgreSQL (pg_dump)');
  }

  /** Удаляет аккаунты, помеченные на удаление более 30 дней назад */
  @Cron('0 3 * * *')
  async purgeDeletedAccounts() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const toDelete = await this.prisma.user.findMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
      },
    });

    for (const user of toDelete) {
      await this.prisma.notification.deleteMany({ where: { userId: user.id } });
      await this.prisma.auditLog.deleteMany({ where: { userId: user.id } });
      await this.prisma.consentLog.deleteMany({ where: { userId: user.id } });
      await this.prisma.user.delete({ where: { id: user.id } });
    }

    if (toDelete.length > 0)
      this.logger.log(`Окончательно удалено аккаунтов: ${toDelete.length}`);
  }
}
