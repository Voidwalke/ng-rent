import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/** Пути, которые не попадают в аудит */
const SKIP_PATHS = ['/health', '/metrics', '/webhook'];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const request = ctx.switchToHttp().getRequest();
    const method = request.method;

    if (['GET', 'OPTIONS', 'HEAD'].includes(method)) {
      return next.handle();
    }

    const user = request.user;
    if (!user?.tenantId) return next.handle();

    const url = request.url as string;
    if (SKIP_PATHS.some((p) => url.includes(p))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          const parts = url.split('/').filter(Boolean);
          // /api/v1/contracts/5/sign → entityType=contracts, entityId=5
          const entityType =
            parts.find((_, i) => i >= 1 && !/^v\d+$/.test(parts[i])) ||
            'unknown';
          const entityId =
            parseInt(parts.find((p) => /^\d+$/.test(p)) || '0') || 0;

          const actionMap: Record<string, string> = {
            POST: 'create',
            PATCH: 'update',
            PUT: 'update',
            DELETE: 'delete',
          };

          await this.prisma.auditLog.create({
            data: {
              tenantId: user.tenantId,
              userId: user.id,
              action: actionMap[method] || method.toLowerCase(),
              entityType,
              entityId,
              newData: responseData || undefined,
              ipAddress: request.ip,
              userAgent: request.headers?.['user-agent'],
            },
          });
        } catch (err) {
          this.logger.warn(`AuditLog write failed: ${err.message}`);
        }
      }),
    );
  }
}
