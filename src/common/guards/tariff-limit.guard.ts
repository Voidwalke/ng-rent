import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

// Лимиты по тарифам
const LIMITS: Record<string, Record<string, number>> = {
  free: { properties: 1, units: 10, users: 2 },
  basic: { properties: 3, units: 50, users: 5 },
  pro: { properties: 10, units: 200, users: 20 },
  enterprise: { properties: -1, units: -1, users: -1 }, // без лимита
};

export const CHECK_LIMIT_KEY = 'check_limit';

/** Декоратор: @CheckLimit('properties') */
export const CheckLimit = (entity: string) =>
  Reflect.metadata(CHECK_LIMIT_KEY, entity);

@Injectable()
export class TariffLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const entity = this.reflector.get<string>(
      CHECK_LIMIT_KEY,
      context.getHandler(),
    );
    if (!entity) return true; // нет декоратора — пропускаем

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.tenantId) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });
    if (!tenant) return true;

    const plan = tenant.plan as string;
    const limit = LIMITS[plan]?.[entity];
    if (!limit || limit === -1) return true; // нет лимита

    let count = 0;
    switch (entity) {
      case 'properties':
        count = await this.prisma.property.count({
          where: { tenantId: user.tenantId, deletedAt: null },
        });
        break;
      case 'units':
        count = await this.prisma.unit.count({
          where: { tenantId: user.tenantId, deletedAt: null },
        });
        break;
      case 'users':
        count = await this.prisma.user.count({
          where: { tenantId: user.tenantId, deletedAt: null },
        });
        break;
    }

    if (count >= limit) {
      throw new ForbiddenException(
        `Превышен лимит тарифного плана: ${plan} позволяет ${limit} ${entity}, у вас уже ${count}`,
      );
    }

    return true;
  }
}
