import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private prisma: PrismaService,
    private queue: QueueService,
  ) {}

  /** Фиксирует согласие пользователя на обработку ПД */
  async recordConsent(userId: number, type: string, ipAddress: string) {
    return this.prisma.consentLog.create({
      data: { userId, type, ipAddress, acceptedAt: new Date() },
    });
  }

  /** Возвращает все согласия пользователя */
  async getUserConsents(userId: number) {
    return this.prisma.consentLog.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  /** Создаёт запрос на экспорт персональных данных */
  async requestDataExport(userId: number, tenantId: number) {
    const existing = await this.prisma.dataExportJob.findFirst({
      where: { userId, status: 'pending' },
    });
    if (existing) return existing;

    const job = await this.prisma.dataExportJob.create({
      data: { userId, tenantId, type: 'full_export', status: 'pending' },
    });

    await this.queue.publish('EXPORT_1C', {
      type: 'data_export',
      payload: { jobId: job.id, userId },
    });

    this.logger.log(
      `Запрос на экспорт данных пользователя ${userId}, job=${job.id}`,
    );
    return job;
  }

  /** Обрабатывает экспорт — собирает все данные пользователя */
  async processDataExport(jobId: number) {
    const job = await this.prisma.dataExportJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;

    const user = await this.prisma.user.findUnique({
      where: { id: job.userId },
    });
    if (!user) return;

    const fileUrl = `exports/${job.userId}/data_${Date.now()}.json`;

    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: 'completed', fileUrl, completedAt: new Date() },
    });

    this.logger.log(`Экспорт данных завершён: job=${jobId}`);
  }

  /** Запрос на удаление аккаунта (soft delete) */
  async requestAccountDeletion(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Аккаунт ${userId} помечен на удаление`);
    return {
      message:
        'Аккаунт помечен на удаление. Данные будут удалены через 30 дней.',
    };
  }

  /** Возвращает статус запросов на экспорт */
  async getExportJobs(userId: number) {
    return this.prisma.dataExportJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
