import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.tenantId) {
      await this.prisma.setTenant(user.tenantId);
    }
    return next.handle().pipe(
      finalize(() => {
        if (user?.tenantId) {
          void this.prisma.resetTenant();
        }
      }),
    );
  }
}
