import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityService', () => {
  let service: ActivityService;

  const mockPrisma: any = {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  getFeed                                                            */
  /* ------------------------------------------------------------------ */
  describe('getFeed', () => {
    it('should return paginated activity feed', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        { id: 1, action: 'contract.created', entityType: 'contract' },
        { id: 2, action: 'invoice.paid', entityType: 'invoice' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(2);

      const result = await service.getFeed(1, 1, 30);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should use default pagination values', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(0);

      const result = await service.getFeed(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(30);
    });

    it('should apply correct skip for page 2', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(50);

      await service.getFeed(1, 2, 10);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should filter by tenantId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.auditLog.count.mockResolvedValueOnce(0);

      await service.getFeed(42);
      const callArgs = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(callArgs.where.tenantId).toBe(42);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getByEntity                                                        */
  /* ------------------------------------------------------------------ */
  describe('getByEntity', () => {
    it('should return activity log for a specific entity', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        { id: 1, entityType: 'contract', entityId: 5, action: 'signed' },
      ]);

      const result = await service.getByEntity(1, 'contract', 5);
      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('contract');
    });

    it('should return empty array if no activity found', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);

      const result = await service.getByEntity(1, 'contract', 999);
      expect(result).toEqual([]);
    });

    it('should pass correct filter parameters to prisma', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);

      await service.getByEntity(1, 'invoice', 10);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, entityType: 'invoice', entityId: 10 },
        }),
      );
    });
  });
});
