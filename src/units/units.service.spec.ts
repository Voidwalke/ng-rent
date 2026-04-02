import { Test, TestingModule } from '@nestjs/testing';
import { UnitsService } from './units.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('UnitsService', () => {
  let service: UnitsService;

  const mockPrisma: any = {
    unit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    contract: { count: jest.fn() },
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<UnitsService>(UnitsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return paginated unit list', async () => {
      mockPrisma.unit.findMany.mockResolvedValueOnce([
        { id: 1, unitNumber: '101', status: 'available' },
      ]);
      mockPrisma.unit.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, { page: 1, limit: 20 } as any);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should return cached data when available', async () => {
      const cached = { data: [{ id: 1 }], total: 1, page: 1, limit: 20, pages: 1 };
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.findAll(1, {} as any);
      expect(result).toEqual(cached);
      expect(mockPrisma.unit.findMany).not.toHaveBeenCalled();
    });

    it('should apply propertyId filter', async () => {
      mockPrisma.unit.findMany.mockResolvedValueOnce([]);
      mockPrisma.unit.count.mockResolvedValueOnce(0);

      await service.findAll(1, { propertyId: 5 } as any);
      const callArgs = mockPrisma.unit.findMany.mock.calls[0][0];
      expect(callArgs.where.propertyId).toBe(5);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findCatalog                                                        */
  /* ------------------------------------------------------------------ */
  describe('findCatalog', () => {
    it('should return only available units from published properties', async () => {
      mockPrisma.unit.findMany.mockResolvedValueOnce([
        { id: 1, status: 'available' },
      ]);
      mockPrisma.unit.count.mockResolvedValueOnce(1);

      const result = await service.findCatalog({ page: 1, limit: 20 } as any);
      expect(result.data).toHaveLength(1);

      const callArgs = mockPrisma.unit.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('available');
      expect(callArgs.where.property.isPublished).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return unit by id', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        unitNumber: '101',
        tenantId: 1,
      });
      const result = await service.findOne(1, 1);
      expect(result.unitNumber).toBe('101');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for wrong tenant on cached result', async () => {
      mockRedis.get.mockResolvedValueOnce({ id: 1, tenantId: 2 });
      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */
  describe('create', () => {
    it('should create a new unit', async () => {
      const dto = {
        propertyId: 1,
        unitNumber: '201',
        areaSqm: 50,
        priceMonth: 80000,
      };
      mockPrisma.unit.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        ...dto,
      });

      const result = await service.create(1, dto as any);
      expect(result.unitNumber).toBe('201');
      expect(result.tenantId).toBe(1);
      expect(mockRedis.delByPattern).toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  setMaintenance                                                     */
  /* ------------------------------------------------------------------ */
  describe('setMaintenance', () => {
    it('should set available unit to maintenance', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'available',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({
        id: 1,
        status: 'maintenance',
      });

      const result = await service.setMaintenance(1, 1);
      expect(result.status).toBe('maintenance');
    });

    it('should throw BadRequestException for rented unit', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'rented',
      });
      await expect(service.setMaintenance(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  setAvailable                                                       */
  /* ------------------------------------------------------------------ */
  describe('setAvailable', () => {
    it('should return maintenance unit to available', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'maintenance',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({
        id: 1,
        status: 'available',
      });

      const result = await service.setAvailable(1, 1);
      expect(result.status).toBe('available');
    });

    it('should throw BadRequestException if unit is not on maintenance', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'available',
      });
      await expect(service.setAvailable(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  remove                                                             */
  /* ------------------------------------------------------------------ */
  describe('remove', () => {
    it('should soft-delete unit without active contracts', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'available',
      });
      mockPrisma.contract.count.mockResolvedValueOnce(0);
      mockPrisma.unit.update.mockResolvedValueOnce({
        id: 1,
        deletedAt: new Date(),
      });

      const result = await service.remove(1, 1);
      expect(result.deletedAt).toBeDefined();
    });

    it('should throw BadRequestException if unit has active contracts', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'rented',
      });
      mockPrisma.contract.count.mockResolvedValueOnce(2);

      await expect(service.remove(1, 1)).rejects.toThrow(BadRequestException);
    });
  });
});
