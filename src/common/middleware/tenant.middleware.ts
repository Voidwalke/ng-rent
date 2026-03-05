import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const user = req['user'] as any;

    if (user?.tenantId) {
      await this.prisma.setTenant(user.tenantId);
    }

    next();
  }
}
