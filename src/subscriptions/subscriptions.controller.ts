import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';

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
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Сменить тарифный план' })
  changePlan(@CurrentUser() user: any, @Body() dto: ChangePlanDto) {
    return this.subscriptionsService.changePlan(user.tenantId, dto.plan as any);
  }

  @Post('cancel')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Отменить подписку' })
  cancel(@CurrentUser() user: any, @Body() dto: CancelSubscriptionDto) {
    return this.subscriptionsService.cancel(user.tenantId, dto.reason);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'История счетов по подписке' })
  getInvoices(@CurrentUser() user: any) {
    return this.subscriptionsService.getInvoices(user.tenantId);
  }

  @Post('pay')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Оплатить подписку (последний неоплаченный счёт)' })
  pay(@CurrentUser() user: any) {
    return this.subscriptionsService.payInvoice(user.tenantId);
  }

  @Post('pay/:invoiceId')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Оплатить конкретный счёт подписки' })
  payInvoice(
    @CurrentUser() user: any,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    return this.subscriptionsService.payInvoice(user.tenantId, invoiceId);
  }
}
