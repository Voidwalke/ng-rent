import { TariffLimitGuard } from './tariff-limit.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';

describe('TariffLimitGuard', () => {
  let guard: TariffLimitGuard;
  let reflector: Reflector;
  let prisma: any;

  const createMockContext = (tenantId: number): ExecutionContext =>
    ({
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { tenantId } }),
      }),
    }) as any;

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      tenant: { findUnique: jest.fn() },
      property: { count: jest.fn() },
      unit: { count: jest.fn() },
      user: { count: jest.fn() },
    };
    guard = new TariffLimitGuard(reflector, prisma);
  });

  it('должен пропустить если нет декоратора @CheckLimit', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const result = await guard.canActivate(createMockContext(1));
    expect(result).toBe(true);
  });

  it('должен пропустить enterprise (без лимита)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('properties');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'enterprise' });

    const result = await guard.canActivate(createMockContext(1));
    expect(result).toBe(true);
  });

  it('должен разрешить создание если лимит не достигнут', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('properties');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'free' });
    prisma.property.count.mockResolvedValueOnce(0); // лимит free = 1

    const result = await guard.canActivate(createMockContext(1));
    expect(result).toBe(true);
  });

  it('должен заблокировать создание при превышении лимита properties', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('properties');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'free' });
    prisma.property.count.mockResolvedValueOnce(1); // free = max 1, уже 1

    await expect(guard.canActivate(createMockContext(1))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('должен заблокировать при превышении лимита units', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('units');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'free' });
    prisma.unit.count.mockResolvedValueOnce(10); // free = max 10

    await expect(guard.canActivate(createMockContext(1))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('должен заблокировать при превышении лимита users', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('users');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'basic' });
    prisma.user.count.mockResolvedValueOnce(5); // basic = max 5

    await expect(guard.canActivate(createMockContext(1))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('должен включить имя тарифа и лимит в сообщение об ошибке', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('properties');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'basic' });
    prisma.property.count.mockResolvedValueOnce(3); // basic = max 3

    try {
      await guard.canActivate(createMockContext(1));
      fail('Expected ForbiddenException');
    } catch (err: any) {
      expect(err.message).toContain('basic');
      expect(err.message).toContain('3');
    }
  });

  it('должен разрешить pro тарифу до 10 объектов', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue('properties');
    prisma.tenant.findUnique.mockResolvedValueOnce({ plan: 'pro' });
    prisma.property.count.mockResolvedValueOnce(9); // pro = max 10, count = 9

    const result = await guard.canActivate(createMockContext(1));
    expect(result).toBe(true);
  });
});
