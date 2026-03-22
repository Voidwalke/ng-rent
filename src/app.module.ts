import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { PropertiesModule } from './properties/properties.module';
import { UnitsModule } from './units/units.module';
import { ClientsModule } from './clients/clients.module';
import { ApplicationsModule } from './applications/applications.module';
import { ContractsModule } from './contracts/contracts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AccessControlModule } from './access-control/access-control.module';
import { DocumentsModule } from './documents/documents.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SupportModule } from './support/support.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ImportModule } from './import/import.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { TenantPortalModule } from './tenant-portal/tenant-portal.module';
import { HealthModule } from './health/health.module';
import { MailerModule } from './mailer/mailer.module';
import { QueueModule } from './queue/queue.module';
import { Integration1CModule } from './integration-1c/integration-1c.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { ComplianceModule } from './compliance/compliance.module';
import { SubscriptionsCron } from './subscriptions/subscriptions.cron';
import { SupportCron } from './support/support.cron';
import { PlatformCron } from './platform-analytics/platform.cron';
import { ActivityModule } from './activity/activity.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ContractTemplatesModule } from './contract-templates/contract-templates.module';
import { RentIndexationModule } from './rent-indexation/rent-indexation.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          redact: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.newPassword',
          ],
        },
      }),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    PropertiesModule,
    UnitsModule,
    ClientsModule,
    ApplicationsModule,
    ContractsModule,
    InvoicesModule,
    PaymentsModule,
    AnalyticsModule,
    NotificationsModule,
    MailerModule,
    QueueModule,
    AccessControlModule,
    DocumentsModule,
    SubscriptionsModule,
    SupportModule,
    OnboardingModule,
    ImportModule,
    PlatformAnalyticsModule,
    TenantPortalModule,
    Integration1CModule,
    HealthModule,
    MetricsModule,
    ComplianceModule,
    ActivityModule,
    MaintenanceModule,
    ContractTemplatesModule,
    RentIndexationModule,
    NotificationPreferencesModule,
  ],
  providers: [
    SubscriptionsCron,
    SupportCron,
    PlatformCron,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
