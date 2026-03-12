import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

describe('ComplianceService', () => {
  let service: ComplianceService;

  const mockPrisma = {
    consentLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    dataExportJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(), update: jest.fn() },
    notification: { findMany: jest.fn(), deleteMany: jest.fn() },
    auditLog: { findMany: jest.fn(), deleteMany: jest.fn() },
  };

  const mockQueue = { publish: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QueueService, useValue: mockQueue },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordConsent', () => {
    it('должен зафиксировать согласие', async () => {
      mockPrisma.consentLog.create.mockResolvedValueOnce({
        id: 1,
        userId: 1,
        consentType: 'personal_data',
      });
      const result = await service.recordConsent(
        1,
        1,
        'personal_data',
        '127.0.0.1',
      );
      expect(result.consentType).toBe('personal_data');
    });
  });

  describe('revokeConsent', () => {
    it('должен отозвать согласие', async () => {
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce({ id: 1 });
      mockPrisma.consentLog.update.mockResolvedValueOnce({
        id: 1,
        revokedAt: new Date(),
      });

      const result = await service.revokeConsent(1, 'personal_data');
      expect(result.revokedAt).toBeDefined();
    });

    it('должен выбросить ошибку если согласие не найдено', async () => {
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(null);
      await expect(service.revokeConsent(1, 'unknown')).rejects.toThrow();
    });
  });

  describe('requestDataExport', () => {
    it('должен создать запрос на экспорт', async () => {
      mockPrisma.dataExportJob.findFirst.mockResolvedValueOnce(null);
      mockPrisma.dataExportJob.create.mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: 'pending',
      });

      const result = await service.requestDataExport(1, 1);
      expect(result.status).toBe('pending');
      expect(mockQueue.publish).toHaveBeenCalled();
    });
  });

  describe('requestAccountDeletion', () => {
    it('должен пометить аккаунт на удаление через 30 дней', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});
      const result = await service.requestAccountDeletion(1);
      expect(result.message).toContain('30 дней');
    });
  });
});
