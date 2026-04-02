import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

describe('ComplianceService', () => {
  let service: ComplianceService;

  const mockPrisma: any = {
    consentLog: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    dataExportJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(), update: jest.fn() },
    notification: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
    client: { findFirst: jest.fn() },
  };

  const mockQueue = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

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

  /* ------------------------------------------------------------------ */
  /*  recordConsent                                                      */
  /* ------------------------------------------------------------------ */
  describe('recordConsent', () => {
    it('should create consent if none exists', async () => {
      // No existing active consent for this type
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(null);
      mockPrisma.consentLog.create.mockResolvedValueOnce({
        id: 1,
        userId: 1,
        type: 'personal_data',
        ipAddress: '192.168.1.1',
        acceptedAt: new Date(),
      });

      const result = await service.recordConsent(
        1,
        'personal_data',
        '192.168.1.1',
      );

      expect(result.id).toBe(1);
      expect(result.type).toBe('personal_data');
      expect(result.ipAddress).toBe('192.168.1.1');

      // Verify create was called (not update)
      expect(mockPrisma.consentLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          type: 'personal_data',
          ipAddress: '192.168.1.1',
          acceptedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.consentLog.update).not.toHaveBeenCalled();
    });

    it('should update existing consent (upsert) when active consent already exists', async () => {
      const existingConsent = {
        id: 5,
        userId: 1,
        type: 'personal_data',
        ipAddress: '10.0.0.1',
        acceptedAt: new Date('2025-01-01'),
        revokedAt: null,
      };
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(existingConsent);
      mockPrisma.consentLog.update.mockResolvedValueOnce({
        id: 5,
        userId: 1,
        type: 'personal_data',
        ipAddress: '192.168.1.100',
        acceptedAt: new Date(),
        revokedAt: null,
      });

      const result = await service.recordConsent(
        1,
        'personal_data',
        '192.168.1.100',
      );

      expect(result.id).toBe(5);
      expect(result.ipAddress).toBe('192.168.1.100');

      // Verify update was called with the existing id, new IP and new date
      expect(mockPrisma.consentLog.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          ipAddress: '192.168.1.100',
          acceptedAt: expect.any(Date),
        },
      });
      // Verify create was NOT called
      expect(mockPrisma.consentLog.create).not.toHaveBeenCalled();
    });

    it('should look up only active (non-revoked) consents for upsert', async () => {
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(null);
      mockPrisma.consentLog.create.mockResolvedValueOnce({
        id: 2,
        userId: 1,
        type: 'marketing',
        ipAddress: '127.0.0.1',
        acceptedAt: new Date(),
      });

      await service.recordConsent(1, 'marketing', '127.0.0.1');

      // Verify findFirst was called with revokedAt: null filter
      expect(mockPrisma.consentLog.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, type: 'marketing', revokedAt: null },
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  revokeConsent                                                      */
  /* ------------------------------------------------------------------ */
  describe('revokeConsent', () => {
    it('should set revokedAt on an active consent', async () => {
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce({
        id: 3,
        userId: 1,
        type: 'personal_data',
        revokedAt: null,
      });
      mockPrisma.consentLog.update.mockResolvedValueOnce({
        id: 3,
        userId: 1,
        type: 'personal_data',
        revokedAt: new Date(),
      });

      const result = await service.revokeConsent(1, 3);

      expect(result.revokedAt).toBeDefined();
      expect(result.revokedAt).toBeInstanceOf(Date);

      // Verify update was called with revokedAt set to a Date
      expect(mockPrisma.consentLog.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if consent does not exist', async () => {
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(null);

      await expect(service.revokeConsent(1, 999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.revokeConsent(1, 999)).rejects.toThrow(
        'Согласие не найдено',
      );
    });

    it('should not revoke consent belonging to another user', async () => {
      // findFirst returns null because it filters by both id and userId
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(null);

      await expect(service.revokeConsent(2, 3)).rejects.toThrow(
        NotFoundException,
      );

      // Verify the query filters by userId
      expect(mockPrisma.consentLog.findFirst).toHaveBeenCalledWith({
        where: { id: 3, userId: 2, revokedAt: null },
      });
    });

    it('should not revoke an already-revoked consent', async () => {
      // findFirst returns null because revokedAt: null filter excludes it
      mockPrisma.consentLog.findFirst.mockResolvedValueOnce(null);

      await expect(service.revokeConsent(1, 3)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getUserConsents                                                     */
  /* ------------------------------------------------------------------ */
  describe('getUserConsents', () => {
    it('should return only active consents (revokedAt is null)', async () => {
      const activeConsents = [
        {
          id: 1,
          userId: 1,
          type: 'personal_data',
          acceptedAt: new Date('2025-06-01'),
          revokedAt: null,
        },
        {
          id: 3,
          userId: 1,
          type: 'marketing',
          acceptedAt: new Date('2025-07-01'),
          revokedAt: null,
        },
      ];
      mockPrisma.consentLog.findMany.mockResolvedValueOnce(activeConsents);

      const result = await service.getUserConsents(1);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('personal_data');
      expect(result[1].type).toBe('marketing');

      // Verify the query filters by revokedAt: null
      expect(mockPrisma.consentLog.findMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        orderBy: { acceptedAt: 'desc' },
      });
    });

    it('should return empty array if no active consents', async () => {
      mockPrisma.consentLog.findMany.mockResolvedValueOnce([]);

      const result = await service.getUserConsents(1);

      expect(result).toEqual([]);
    });

    it('should order results by acceptedAt desc', async () => {
      mockPrisma.consentLog.findMany.mockResolvedValueOnce([]);

      await service.getUserConsents(1);

      expect(mockPrisma.consentLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { acceptedAt: 'desc' },
        }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  requestDataExport                                                  */
  /* ------------------------------------------------------------------ */
  describe('requestDataExport', () => {
    it('should create export job and publish to queue', async () => {
      mockPrisma.dataExportJob.findFirst.mockResolvedValueOnce(null);
      mockPrisma.dataExportJob.create.mockResolvedValueOnce({
        id: 1,
        userId: 1,
        status: 'pending',
      });

      const result = await service.requestDataExport(1, 1);

      expect(result.status).toBe('pending');
      expect(mockQueue.publish).toHaveBeenCalledWith(
        'EXPORT_1C',
        expect.objectContaining({
          type: 'data_export',
          payload: { jobId: 1, userId: 1 },
        }),
      );
    });

    it('should return existing pending job without creating a new one', async () => {
      const existingJob = { id: 5, userId: 1, status: 'pending' };
      mockPrisma.dataExportJob.findFirst.mockResolvedValueOnce(existingJob);

      const result = await service.requestDataExport(1, 1);

      expect(result).toEqual(existingJob);
      expect(mockPrisma.dataExportJob.create).not.toHaveBeenCalled();
      expect(mockQueue.publish).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  requestAccountDeletion                                             */
  /* ------------------------------------------------------------------ */
  describe('requestAccountDeletion', () => {
    it('should soft-delete user by setting deletedAt', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.requestAccountDeletion(1);

      expect(result.message).toContain('удаление');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
