import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // Если роли не указаны — доступ открыт
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = ctx.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
