import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

describe('ComplianceService', () => {
  let service: ComplianceService;

  const mockPrisma = {
    consentLog: { create: jest.fn(), findMany: jest.fn() },
    dataExportJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(), update: jest.fn() },
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
        type: 'personal_data',
      });
      const result = await service.recordConsent(
        1,
        'personal_data',
        '127.0.0.1',
      );
      expect(result.type).toBe('personal_data');
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
    it('должен пометить аккаунт на удаление', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});
      const result = await service.requestAccountDeletion(1);
      expect(result.message).toContain('удаление');
    });
  });
});
