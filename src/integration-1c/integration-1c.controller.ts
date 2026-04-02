import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Res,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import * as crypto from 'crypto';
import { Public, CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { Integration1CService } from './integration-1c.service';
import { Integration1CProvider } from './integration-1c.provider';
import { PaymentWebhookDto, ClientWebhookDto } from './dto';

@ApiTags('Интеграция 1С')
@Controller('integration/1c')
export class Integration1CController {
  private readonly webhookSecret: string;

  constructor(
    private service: Integration1CService,
    private provider: Integration1CProvider,
    private config: ConfigService,
  ) {
    this.webhookSecret = this.config.get('INTEGRATION_1C_WEBHOOK_SECRET', '');
  }

  private validateWebhookSecret(secret: string | undefined) {
    if (!this.webhookSecret)
      throw new UnauthorizedException('Webhook secret not configured');
    if (
      !secret ||
      secret.length !== this.webhookSecret.length ||
      !crypto.timingSafeEqual(
        Buffer.from(secret),
        Buffer.from(this.webhookSecret),
      )
    ) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  @Public()
  @Post('webhook/payment')
  @ApiOperation({ summary: 'Webhook: подтверждение оплаты из 1С' })
  async paymentWebhook(
    @Body() body: PaymentWebhookDto,
    @Headers('x-webhook-secret') secret: string,
  ) {
    this.validateWebhookSecret(secret);
    return this.service.handlePaymentWebhook(body, body.tenantId);
  }

  @Public()
  @Post('webhook/client')
  @ApiOperation({ summary: 'Webhook: обновление контрагента из 1С' })
  async clientWebhook(
    @Body() body: ClientWebhookDto,
    @Headers('x-webhook-secret') secret: string,
  ) {
    this.validateWebhookSecret(secret);
    return this.service.handleClientUpdate(body, body.tenantId);
  }

  @Post('export')
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ручной экспорт счетов и договоров в 1С' })
  async exportAll(@CurrentUser('tenantId') tenantId: number) {
    return this.service.exportAll(tenantId);
  }

  @Get('export/invoices/excel')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспорт счетов в Excel для 1С' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportInvoicesExcel(
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportInvoicesExcel(tenantId);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="invoices_1c_${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/contracts/excel')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспорт договоров в Excel для 1С' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportContractsExcel(
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportContractsExcel(tenantId);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="contracts_1c_${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/acts/excel')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспорт актов в Excel для 1С' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportActsExcel(
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportActsExcel(tenantId);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="acts_1c_${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('changes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Изменения с указанной даты для синхронизации с 1С' })
  async changes(
    @CurrentUser('tenantId') tenantId: number,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : new Date(0);
    if (isNaN(sinceDate.getTime())) {
      throw new BadRequestException('Неверный формат даты. Используйте ISO 8601');
    }
    return this.service.getChangesSince(tenantId, sinceDate);
  }

  @Get('health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Статус интеграции с 1С' })
  async health(@CurrentUser('tenantId') tenantId: number) {
    // Проверка последней синхронизации — поиск счетов с paymentReference от 1С
    const lastSync = await this.service.getLastSyncTime(tenantId);
    const providerOk = await this.provider.healthCheck();
    const hasConnection = !!lastSync || providerOk;
    return {
      status: hasConnection ? 'connected' : 'no_sync',
      lastSyncAt: lastSync,
      apiAvailable: providerOk,
    };
  }
}
