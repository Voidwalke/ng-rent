import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrisma = {
    unit: { count: jest.fn(), aggregate: jest.fn() },
    contract: { count: jest.fn() },
    invoice: { count: jest.fn(), aggregate: jest.fn() },
    application: { count: jest.fn() },
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
        occupancyRate: 0.85,
        totalRevenueMonth: 500000,
        activeContracts: 10,
      });
      mockRedis.get.mockResolvedValueOnce(cachedData);

      const result = await service.getDashboard(1);

      expect(result.occupancyRate).toBe(0.85);
      expect(mockPrisma.unit.count).not.toHaveBeenCalled();
    });

    it('should compute metrics and cache when no cache exists', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      // Мокаем все запросы аналитики
      mockPrisma.unit.count
        .mockResolvedValueOnce(100) // total units
        .mockResolvedValueOnce(80); // rented units
      mockPrisma.contract.count.mockResolvedValueOnce(80);
      mockPrisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 5000000 } }) // revenue
        .mockResolvedValueOnce({ _sum: { totalAmount: 200000 } }); // outstanding
      mockPrisma.invoice.count
        .mockResolvedValueOnce(5) // overdue
        .mockResolvedValueOnce(100); // total invoices
      mockPrisma.application.count.mockResolvedValueOnce(15);

      const result = await service.getDashboard(1);

      expect(result).toHaveProperty('occupancyRate');
      expect(result).toHaveProperty('totalRevenueMonth');
      expect(result).toHaveProperty('activeContracts');
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });
});
