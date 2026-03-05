import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

// Записываем все мутации в audit_log
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const request = ctx.switchToHttp().getRequest();
    const method = request.method;

    // Логируем только мутации
    if (['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return next.handle();
    }

    const user = request.user;
    if (!user) return next.handle();

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const url = request.url as string;
          const parts = url.split('/').filter(Boolean);
          // Определяем тип сущности из URL (/api/properties/1 -> properties)
          const entityType = parts[1] || 'unknown';
          const entityId = parseInt(parts[2]) || 0;

          const actionMap: Record<string, string> = {
            POST: 'create',
            PATCH: 'update',
            PUT: 'update',
            DELETE: 'delete',
          };

          await this.prisma.auditLog.create({
            data: {
              tenantId: user.tenantId,
              userId: user.userId,
              action: actionMap[method] || method.toLowerCase(),
              entityType,
              entityId,
              newData: responseData || undefined,
              ipAddress: request.ip,
            },
          });
        } catch {
          // Ошибка аудита не должна ронять запрос
        }
      }),
    );
  }
}
