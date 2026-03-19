import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public, CurrentUser, Roles } from '../common/decorators';
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
    if (secret !== this.webhookSecret) {
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
    return this.service.handlePaymentWebhook(body);
  }

  @Public()
  @Post('webhook/client')
  @ApiOperation({ summary: 'Webhook: обновление контрагента из 1С' })
  async clientWebhook(
    @Body() body: ClientWebhookDto,
    @Headers('x-webhook-secret') secret: string,
  ) {
    this.validateWebhookSecret(secret);
    return this.service.handleClientUpdate(body);
  }

  @Post('export')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ручной экспорт счетов и договоров в 1С' })
  async exportAll(@CurrentUser('tenantId') tenantId: number) {
    return this.service.exportAll(tenantId);
  }

  @Get('health')
  @ApiOperation({ summary: 'Проверка доступности 1С' })
  async health() {
    const available = await this.provider.healthCheck();
    return { status: available ? 'connected' : 'unavailable' };
  }
}
