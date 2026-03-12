import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
  async recordConsent(
    userId: number,
    tenantId: number,
    consentType: string,
    ipAddress: string,
  ) {
    return this.prisma.consentLog.create({
      data: {
        userId,
        tenantId,
        consentType,
        ipAddress,
        grantedAt: new Date(),
      },
    });
  }

  /** Отзывает согласие на обработку ПД */
  async revokeConsent(userId: number, consentType: string) {
    const consent = await this.prisma.consentLog.findFirst({
      where: { userId, consentType, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });

    if (!consent) throw new NotFoundException('Согласие не найдено');

    return this.prisma.consentLog.update({
      where: { id: consent.id },
      data: { revokedAt: new Date() },
    });
  }

  /** Возвращает все действующие согласия пользователя */
  async getUserConsents(userId: number) {
    return this.prisma.consentLog.findMany({
      where: { userId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /** Создаёт запрос на экспорт персональных данных */
  async requestDataExport(userId: number, tenantId: number) {
    const existing = await this.prisma.dataExportJob.findFirst({
      where: { userId, status: 'pending' },
    });

    if (existing) return existing;

    const job = await this.prisma.dataExportJob.create({
      data: {
        userId,
        tenantId,
        status: 'pending',
        requestedAt: new Date(),
      },
    });

    await this.queue.publish('EXPORT_1C', {
      type: 'data_export',
      jobId: job.id,
      userId,
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

    const data = {
      profile: {
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        createdAt: user.createdAt,
      },
      consents: await this.prisma.consentLog.findMany({
        where: { userId: job.userId },
      }),
      notifications: await this.prisma.notification.findMany({
        where: { userId: job.userId },
      }),
      auditLog: await this.prisma.auditLog.findMany({
        where: { userId: job.userId },
      }),
    };

    const fileUrl = `exports/${job.userId}/data_${Date.now()}.json`;

    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        fileUrl,
        completedAt: new Date(),
        exportData: data,
      },
    });

    this.logger.log(`Экспорт данных завершён: job=${jobId}`);
  }

  /** Запрос на удаление аккаунта (soft delete + 30 дней) */
  async requestAccountDeletion(userId: number) {
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), deletionScheduledAt: deletionDate },
    });

    this.logger.log(
      `Аккаунт ${userId} помечен на удаление: ${deletionDate.toISOString()}`,
    );
    return { message: 'Аккаунт будет удалён через 30 дней', deletionDate };
  }

  /** Возвращает статус запросов на экспорт */
  async getExportJobs(userId: number) {
    return this.prisma.dataExportJob.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
  }
}
