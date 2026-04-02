import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
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
    subscriptionInvoice: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    tenant: { update: jest.fn() },
    user: { count: jest.fn() },
    property: { count: jest.fn() },
    unit: { count: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
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
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  getPlans                                                           */
  /* ------------------------------------------------------------------ */
  describe('getPlans', () => {
    it('should return 4 plans with correct structure', () => {
      const plans = service.getPlans();

      expect(plans).toHaveLength(4);

      // Verify all plan codes are present
      const planCodes = plans.map((p) => p.plan);
      expect(planCodes).toEqual(['free', 'basic', 'pro', 'enterprise']);

      // Verify each plan has the required fields
      for (const plan of plans) {
        expect(plan).toHaveProperty('id');
        expect(plan).toHaveProperty('code');
        expect(plan).toHaveProperty('plan');
        expect(plan).toHaveProperty('name');
        expect(plan).toHaveProperty('priceMonthly');
        expect(plan).toHaveProperty('limits');
        expect(plan.limits).toHaveProperty('users');
        expect(plan.limits).toHaveProperty('properties');
        expect(plan.limits).toHaveProperty('units');
      }

      // Verify specific prices
      expect(plans[0].priceMonthly).toBe(0);       // free
      expect(plans[1].priceMonthly).toBe(5000);    // basic
      expect(plans[2].priceMonthly).toBe(15000);   // pro
      expect(plans[3].priceMonthly).toBe(45000);   // enterprise

      // Verify names
      expect(plans[0].name).toBe('Бесплатный');
      expect(plans[1].name).toBe('Базовый');
      expect(plans[2].name).toBe('Профессиональный');
      expect(plans[3].name).toBe('Корпоративный');

      // Verify enterprise has unlimited limits (-1)
      expect(plans[3].limits.users).toBe(-1);
      expect(plans[3].limits.properties).toBe(-1);
      expect(plans[3].limits.units).toBe(-1);
    });

    it('should return free plan with specific limits', () => {
      const plans = service.getPlans();
      const freePlan = plans.find((p) => p.plan === 'free');

      expect(freePlan).toBeDefined();
      expect(freePlan!.limits.users).toBe(2);
      expect(freePlan!.limits.properties).toBe(1);
      expect(freePlan!.limits.units).toBe(10);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getCurrent                                                         */
  /* ------------------------------------------------------------------ */
  describe('getCurrent', () => {
    it('should return current subscription with limits', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'basic',
        tenantId: 1,
        status: 'active',
      });

      const result = await service.getCurrent(1);

      expect(result.limits).toBeDefined();
      expect(result.limits.users).toBe(5);
      expect(result.limits.properties).toBe(3);
      expect(result.limits.units).toBe(50);
      expect(result.priceMonthly).toBe(5000);
    });

    it('should return pro plan limits correctly', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 2,
        plan: 'pro',
        tenantId: 1,
        status: 'active',
      });

      const result = await service.getCurrent(1);

      expect(result.limits.users).toBe(20);
      expect(result.limits.properties).toBe(10);
      expect(result.limits.units).toBe(200);
      expect(result.priceMonthly).toBe(15000);
    });

    it('should throw NotFoundException when no active subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce(null);

      await expect(service.getCurrent(1)).rejects.toThrow(NotFoundException);
      await expect(service.getCurrent(1)).rejects.toThrow(
        'Подписка не найдена',
      );
    });

    it('should fallback to free limits for unknown plan', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'unknown_plan',
        tenantId: 1,
        status: 'active',
      });

      const result = await service.getCurrent(1);

      expect(result.limits).toEqual({ users: 2, properties: 1, units: 10 });
      expect(result.priceMonthly).toBe(0);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  changePlan                                                         */
  /* ------------------------------------------------------------------ */
  describe('changePlan', () => {
    it('should create new subscription and invoice when changing to paid plan', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'free',
        tenantId: 1,
        status: 'active',
      });
      // All counts within limits of basic plan
      mockPrisma.user.count.mockResolvedValueOnce(2);
      mockPrisma.property.count.mockResolvedValueOnce(1);
      mockPrisma.unit.count.mockResolvedValueOnce(5);
      mockPrisma.subscription.update.mockResolvedValueOnce({});
      mockPrisma.subscription.create.mockResolvedValueOnce({
        id: 2,
        plan: 'basic',
        status: 'active',
        priceMonthly: 5000,
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({});
      mockPrisma.subscriptionInvoice.create.mockResolvedValueOnce({
        id: 1,
        amount: 5000,
        status: 'pending',
      });

      const result = await service.changePlan(1, 'basic' as any);

      // Verify old subscription was canceled
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'canceled',
            cancelReason: expect.stringContaining('basic'),
          }),
        }),
      );
      // Verify new subscription was created
      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 1,
            plan: 'basic',
            priceMonthly: 5000,
            status: 'active',
          }),
        }),
      );
      // Verify tenant plan was updated
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { plan: 'basic' },
        }),
      );
      // Verify an invoice was created for the paid plan
      expect(mockPrisma.subscriptionInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 1,
            amount: 5000,
            status: 'pending',
          }),
        }),
      );
      expect(result.plan).toBe('basic');
    });

    it('should not create invoice when changing to free plan', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'basic',
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.property.count.mockResolvedValueOnce(1);
      mockPrisma.unit.count.mockResolvedValueOnce(5);
      mockPrisma.subscription.update.mockResolvedValueOnce({});
      mockPrisma.subscription.create.mockResolvedValueOnce({
        id: 2,
        plan: 'free',
        status: 'active',
        priceMonthly: 0,
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({});

      await service.changePlan(1, 'free' as any);

      // No invoice for free plan
      expect(mockPrisma.subscriptionInvoice.create).not.toHaveBeenCalled();
    });

    it('should validate plan name and reject same plan', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'basic',
        tenantId: 1,
        status: 'active',
      });

      await expect(service.changePlan(1, 'basic' as any)).rejects.toThrow(
        BadRequestException,
      );

      // Reset mock for the second assertion
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'basic',
        tenantId: 1,
        status: 'active',
      });
      await expect(
        service.changePlan(1, 'basic' as any),
      ).rejects.toThrow('Вы уже на этом тарифе');
    });

    it('should check current limits and reject if users exceed', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'pro',
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.user.count.mockResolvedValueOnce(10); // exceeds basic limit of 5

      await expect(service.changePlan(1, 'basic' as any)).rejects.toThrow(
        /макс. 5 пользователей/,
      );
    });

    it('should check current limits and reject if properties exceed', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'pro',
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.user.count.mockResolvedValueOnce(2); // within limits
      mockPrisma.property.count.mockResolvedValueOnce(8); // exceeds basic limit of 3

      await expect(service.changePlan(1, 'basic' as any)).rejects.toThrow(
        /макс. 3 объектов/,
      );
    });

    it('should check current limits and reject if units exceed', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce({
        id: 1,
        plan: 'pro',
        tenantId: 1,
        status: 'active',
      });
      mockPrisma.user.count.mockResolvedValueOnce(2);
      mockPrisma.property.count.mockResolvedValueOnce(1);
      mockPrisma.unit.count.mockResolvedValueOnce(100); // exceeds basic limit of 50

      await expect(service.changePlan(1, 'basic' as any)).rejects.toThrow(
        /макс. 50 помещений/,
      );
    });

    it('should throw NotFoundException when no active subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce(null);

      await expect(service.changePlan(1, 'basic' as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  cancel                                                             */
  /* ------------------------------------------------------------------ */
  describe('cancel', () => {
    it('should set status to canceled and switch to free', async () => {
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
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'canceled',
          }),
        }),
      );
    });

    it('should throw NotFoundException when no active subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValueOnce(null);

      await expect(service.cancel(1)).rejects.toThrow(NotFoundException);
    });

    it('should use provided reason', async () => {
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

      await service.cancel(1, 'Переход к конкуренту');

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelReason: 'Переход к конкуренту',
          }),
        }),
      );
    });
  });
});
