import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // Публичные эндпоинты пропускаем без авторизации
    if (isPublic) return true;

    const result = await (super.canActivate(ctx) as Promise<boolean>);
    if (!result) return false;

    // Проверяем, что тенант активен
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (user?.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { isActive: true },
      });
      if (!tenant?.isActive) {
        throw new ForbiddenException(
          'Аккаунт организации заморожен. Обратитесь в поддержку.',
        );
      }
    }

    return true;
  }
}
