import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrisma = {
    property: { count: jest.fn(), findMany: jest.fn() },
    unit: { count: jest.fn(), findMany: jest.fn() },
    contract: { count: jest.fn(), findMany: jest.fn() },
    invoice: { count: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
    application: { count: jest.fn() },
    payment: { findMany: jest.fn() },
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
      const cachedData = {
        totalProperties: 5,
        totalUnits: 50,
        occupancyRate: 85,
        monthlyRevenue: 500000,
        overdueInvoices: 2,
        overdueRate: 4,
        activeContracts: 10,
        pendingApplications: 3,
        avgRentPerSqm: 1200,
      };
      mockRedis.get.mockResolvedValueOnce(cachedData);

      const result = await service.getDashboard(1);

      expect(result).toEqual(cachedData);
      expect(mockPrisma.property.count).not.toHaveBeenCalled();
    });

    it('should return correct KPI shape when no cache', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      mockPrisma.property.count.mockResolvedValueOnce(5);
      mockPrisma.unit.count
        .mockResolvedValueOnce(100)  // totalUnits
        .mockResolvedValueOnce(80);  // rentedUnits
      mockPrisma.contract.count.mockResolvedValueOnce(10); // activeContracts
      mockPrisma.application.count.mockResolvedValueOnce(3); // pendingApplications
      mockPrisma.invoice.aggregate.mockResolvedValueOnce({ _sum: { amount: 500000 } }); // monthlyRevenue
      mockPrisma.invoice.count
        .mockResolvedValueOnce(50)   // totalInvoices
        .mockResolvedValueOnce(2);   // overdueInvoices
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { monthlyRent: 60000, unit: { areaSqm: 50 } },
        { monthlyRent: 40000, unit: { areaSqm: 40 } },
      ]);

      const result = await service.getDashboard(1);

      expect(result).toEqual(
        expect.objectContaining({
          totalProperties: 5,
          totalUnits: 100,
          occupancyRate: expect.any(Number),
          monthlyRevenue: expect.any(Number),
          overdueInvoices: expect.any(Number),
          overdueRate: expect.any(Number),
          activeContracts: expect.any(Number),
          pendingApplications: expect.any(Number),
          avgRentPerSqm: expect.any(Number),
        }),
      );
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('getRevenue', () => {
    it('should return array with month keys', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);

      const result = await service.getRevenue(1, 3);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      for (const entry of result) {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('revenue');
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
      }
    });

    it('should return cached revenue data if available', async () => {
      const cached = [{ month: '2025-01', revenue: 100000 }];
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.getRevenue(1, 6);

      expect(result).toEqual(cached);
      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOccupancy', () => {
    it('should return properties with occupancyRate', async () => {
      mockPrisma.property.findMany.mockResolvedValueOnce([
        {
          id: 1,
          name: 'Office A',
          units: [
            { id: 1, status: 'rented', areaSqm: 50 },
            { id: 2, status: 'available', areaSqm: 30 },
            { id: 3, status: 'rented', areaSqm: 40 },
          ],
        },
        {
          id: 2,
          name: 'Office B',
          units: [],
        },
      ]);

      const result = await service.getOccupancy(1);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          propertyId: 1,
          propertyName: 'Office A',
          totalUnits: 3,
          rentedUnits: 2,
          occupancyRate: 67,
          totalArea: 120,
          rentedArea: 90,
        }),
      );
      expect(result[1].occupancyRate).toBe(0);
    });
  });

  describe('getCashflow', () => {
    it('should return billed/collected per month', async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);
      mockPrisma.payment.findMany.mockResolvedValueOnce([]);

      const result = await service.getCashflow(1, 4);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4);
      for (const entry of result) {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('billed');
        expect(entry).toHaveProperty('collected');
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof entry.billed).toBe('number');
        expect(typeof entry.collected).toBe('number');
      }
    });
  });
});
