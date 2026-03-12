import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Устанавливает tenant_id для RLS-изоляции */
  async setTenant(tenantId: number) {
    await this.$executeRawUnsafe(`SET app.current_tenant = '${tenantId}'`);
  }

  /** Сбрасывает tenant_id (для суперадмина) */
  async resetTenant() {
    await this.$executeRawUnsafe(`RESET app.current_tenant`);
  }
}
