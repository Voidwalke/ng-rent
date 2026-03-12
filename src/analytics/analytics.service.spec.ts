import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrisma = {
    property: { count: jest.fn() },
    unit: { count: jest.fn(), aggregate: jest.fn() },
    contract: { count: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
    invoice: { count: jest.fn(), aggregate: jest.fn() },
    application: { count: jest.fn() },
    client: { count: jest.fn() },
    $queryRaw: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should return cached data if available', async () => {
      const cachedData = JSON.stringify({
        totalProperties: 5,
        totalUnits: 50,
        occupancyRate: 0.85,
        totalRevenueMonth: 500000,
        activeContracts: 10,
      });
      mockRedis.get.mockResolvedValueOnce(cachedData);

      const result = await service.getDashboard(1);

      expect(result).toBeDefined();
      expect(mockPrisma.unit.count).not.toHaveBeenCalled();
    });

    it('should compute metrics and cache when no cache exists', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      mockPrisma.property.count.mockResolvedValueOnce(5);
      mockPrisma.unit.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80);
      mockPrisma.contract.count.mockResolvedValueOnce(80);
      mockPrisma.contract.findMany.mockResolvedValueOnce([]);
      mockPrisma.client.count.mockResolvedValueOnce(20);
      mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 5000000 } })
        .mockResolvedValueOnce({ _sum: { totalAmount: 200000 } });
      mockPrisma.invoice.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(100);
      mockPrisma.contract.aggregate.mockResolvedValueOnce({
        _avg: { monthlyRent: 50000 },
      });
      mockPrisma.application.count.mockResolvedValueOnce(15);

      const result = await service.getDashboard(1);

      expect(result).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });
});
