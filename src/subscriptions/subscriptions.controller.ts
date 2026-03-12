import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { TenantPlan } from '@prisma/client';

@ApiTags('Подписки')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'Доступные тарифные планы' })
  getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('current')
  @ApiOperation({ summary: 'Текущая подписка' })
  getCurrent(@CurrentUser() user: any) {
    return this.subscriptionsService.getCurrent(user.tenantId);
  }

  @Post('change-plan')
  @Roles('admin')
  @ApiOperation({ summary: 'Сменить тарифный план' })
  changePlan(@CurrentUser() user: any, @Body('plan') plan: TenantPlan) {
    return this.subscriptionsService.changePlan(user.tenantId, plan);
  }

  @Post('cancel')
  @Roles('admin')
  @ApiOperation({ summary: 'Отменить подписку' })
  cancel(@CurrentUser() user: any, @Body('reason') reason?: string) {
    return this.subscriptionsService.cancel(user.tenantId, reason);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'История счетов по подписке' })
  getInvoices(@CurrentUser() user: any) {
    return this.subscriptionsService.getInvoices(user.tenantId);
  }
}
