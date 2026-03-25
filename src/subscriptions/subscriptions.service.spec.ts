import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  const mockPrisma: any = {
    subscription: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subscriptionInvoice: { findMany: jest.fn() },
    tenant: { update: jest.fn() },
    user: { count: jest.fn() },
    property: { count: jest.fn() },
    unit: { count: jest.fn() },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue(''),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlans', () => {
    it('должен вернуть 4 тарифных плана', () => {
      const plans = service.getPlans();
      expect(plans).toHaveLength(4);
      expect(plans[0].plan).toBe('free');
      expect(plans[3].plan).toBe('enterprise');
    });
  });

  describe('getCurrent', () => {
    it('должен вернуть текущую подписку с лимитами', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'basic',
        tenantId: 1,
        status: 'active',
      });

      const result = await service.getCurrent(1);
      expect(result.limits.users).toBe(5);
      expect(result.priceMonthly).toBe(5000);
    });

    it('должен выбросить ошибку без подписки', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce(null);
      await expect(service.getCurrent(1)).rejects.toThrow(
        'Подписка не найдена',
      );
    });
  });

  describe('changePlan', () => {
    it('должен сменить тариф', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'free',
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.user.count.mockResolvedValueOnce(2);
      mockPrisma.property.count.mockResolvedValueOnce(1);
      mockPrisma.unit.count.mockResolvedValueOnce(5);
      mockPrisma.subscription.update.mockResolvedValueOnce({});
      mockPrisma.subscription.create.mockResolvedValueOnce({
        id: 2,
        plan: 'basic',
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({});

      const result = await service.changePlan(1, 'basic' as any);
      expect(result.plan).toBe('basic');
    });

    it('должен отклонить если превышен лимит пользователей', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'pro',
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.user.count.mockResolvedValueOnce(10);

      await expect(service.changePlan(1, 'basic' as any)).rejects.toThrow(
        /макс. 5 пользователей/,
      );
    });
  });

  describe('cancel', () => {
    it('должен отменить подписку и перевести на free', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.subscription.update.mockResolvedValueOnce({});
      mockPrisma.tenant.update.mockResolvedValueOnce({});
      mockPrisma.subscription.create.mockResolvedValueOnce({
        id: 2,
        plan: 'free',
      });

      const result = await service.cancel(1);
      expect(result.message).toContain('отменена');
    });
  });
});
