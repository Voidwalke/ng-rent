import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  /** Хранилище экспортированных данных (в проде — MinIO/S3) */
  private exportCache = new Map<number, any>();

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

  /** Обрабатывает экспорт — собирает все данные пользователя (152-ФЗ) */
  async processDataExport(jobId: number) {
    const job = await this.prisma.dataExportJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;

    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: job.userId },
    });
    if (!user) return;

    // Собираем все персональные данные пользователя
    const [notifications, auditLogs, consents] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.consentLog.findMany({
        where: { userId: user.id },
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);

    // Если у пользователя есть связанный клиент — берём его данные
    const client = await this.prisma.client.findFirst({
      where: { userId: user.id },
      include: {
        contracts: { include: { invoices: true } },
        applications: true,
        accessCards: true,
      },
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      },
      client: client
        ? {
            companyName: client.companyName,
            inn: client.inn,
            kpp: client.kpp,
            contactName: client.contactName,
            contactEmail: client.contactEmail,
            contactPhone: client.contactPhone,
            legalAddress: client.legalAddress,
            applications: client.applications.map((a) => ({
              id: a.id,
              status: a.status,
              createdAt: a.createdAt,
            })),
            contracts: client.contracts.map((c) => ({
              contractNumber: c.contractNumber,
              status: c.status,
              startDate: c.startDate,
              endDate: c.endDate,
              monthlyRent: c.monthlyRent,
              invoices: c.invoices.map((i) => ({
                invoiceNumber: i.invoiceNumber,
                status: i.status,
                totalAmount: i.totalAmount,
                dueDate: i.dueDate,
              })),
            })),
            accessCards: client.accessCards.map((ac) => ({
              cardNumber: ac.cardNumber,
              isActive: ac.isActive,
              activatedAt: ac.activatedAt,
            })),
          }
        : null,
      notifications: notifications.map((n) => ({
        type: n.type,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })),
      auditLog: auditLogs.map((a) => ({
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        createdAt: a.createdAt,
        ipAddress: a.ipAddress,
      })),
      consents: consents.map((c) => ({
        type: c.type,
        acceptedAt: c.acceptedAt,
        ipAddress: c.ipAddress,
      })),
    };

    const fileUrl = `exports/${job.userId}/data_${Date.now()}.json`;

    // Сохраняем в кэш для выдачи через getExportData
    this.exportCache.set(jobId, exportData);

    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        fileUrl,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Экспорт данных завершён: job=${jobId}, пользователь ${user.email}`,
    );
  }

  /** Возвращает экспортированные данные пользователя */
  async getExportData(userId: number, jobId: number) {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { id: jobId, userId, status: 'completed' },
    });
    if (!job) throw new NotFoundException('Экспорт не найден');

    // Если данные в кэше — отдаём
    const cached = this.exportCache.get(jobId);
    if (cached) return cached;

    // Иначе заново собираем (после перезапуска сервера)
    await this.processDataExport(jobId);
    return this.exportCache.get(jobId) || null;
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
