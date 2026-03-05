import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Устанавливаем tenant_id для RLS-изоляции
  async setTenant(tenantId: number) {
    await this.$executeRawUnsafe(`SET app.current_tenant = '${tenantId}'`);
  }

  // Сброс tenant_id (для суперадмина)
  async resetTenant() {
    await this.$executeRawUnsafe(`RESET app.current_tenant`);
  }
}
