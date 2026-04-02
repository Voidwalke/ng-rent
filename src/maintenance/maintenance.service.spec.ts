import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceService } from './maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('MaintenanceService', () => {
  let service: MaintenanceService;

  const mockPrisma: any = {
    maintenanceRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return paginated maintenance requests', async () => {
      mockPrisma.maintenanceRequest.findMany.mockResolvedValueOnce([
        { id: 1, title: 'Протечка', status: 'open' },
      ]);
      mockPrisma.maintenanceRequest.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should cap limit at 100', async () => {
      mockPrisma.maintenanceRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.maintenanceRequest.count.mockResolvedValueOnce(0);

      await service.findAll(1, { limit: 999 });
      expect(mockPrisma.maintenanceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should filter by status', async () => {
      mockPrisma.maintenanceRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.maintenanceRequest.count.mockResolvedValueOnce(0);

      await service.findAll(1, { status: 'open' });
      const callArgs = mockPrisma.maintenanceRequest.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('open');
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return maintenance request by id', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        title: 'Протечка',
        tenantId: 1,
      });
      const result = await service.findOne(1, 1);
      expect(result.title).toBe('Протечка');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */
  describe('create', () => {
    it('should create a maintenance request with default priority', async () => {
      mockPrisma.maintenanceRequest.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        unitId: 5,
        reportedBy: 1,
        title: 'Сломан кондиционер',
        priority: 'medium',
      });

      const result = await service.create(1, 1, {
        unitId: 5,
        title: 'Сломан кондиционер',
        description: 'Не работает охлаждение',
      });
      expect(result.priority).toBe('medium');
      expect(result.tenantId).toBe(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  update — status transitions                                       */
  /* ------------------------------------------------------------------ */
  describe('update', () => {
    it('should allow transition from open to in_progress', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'open',
      });
      mockPrisma.maintenanceRequest.update.mockResolvedValueOnce({
        id: 1,
        status: 'in_progress',
      });

      const result = await service.update(1, 1, { status: 'in_progress' });
      expect(result.status).toBe('in_progress');
    });

    it('should allow transition from in_progress to completed and set completedAt', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'in_progress',
      });
      mockPrisma.maintenanceRequest.update.mockImplementation(
        ({ data }: any) => ({
          id: 1,
          ...data,
        }),
      );

      const result = await service.update(1, 1, { status: 'completed' });
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('should throw BadRequestException for invalid status transition (open -> completed)', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'open',
      });

      await expect(
        service.update(1, 1, { status: 'completed' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for transition from completed', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'completed',
      });

      await expect(
        service.update(1, 1, { status: 'open' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for transition from cancelled', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'cancelled',
      });

      await expect(
        service.update(1, 1, { status: 'open' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  remove                                                             */
  /* ------------------------------------------------------------------ */
  describe('remove', () => {
    it('should delete a maintenance request', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
      });
      mockPrisma.maintenanceRequest.delete.mockResolvedValueOnce({});

      const result = await service.remove(1, 1);
      expect(result.message).toContain('удалена');
    });

    it('should throw NotFoundException if request does not exist', async () => {
      mockPrisma.maintenanceRequest.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
