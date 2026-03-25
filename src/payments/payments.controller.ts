import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { YookassaWebhookDto } from './dto/yookassa-webhook.dto';
import { RefundDto } from './dto/refund.dto';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Платежи')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('invoice/:invoiceId')
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Создать платёж по счёту' })
  createPayment(
    @CurrentUser() user: any,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    return this.paymentsService.createPayment(user.tenantId, invoiceId);
  }

  @Post('invoice/:invoiceId/refund')
  @ApiBearerAuth()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Возврат платежа' })
  refund(
    @CurrentUser() user: any,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Body() dto: RefundDto,
  ) {
    return this.paymentsService.refund(user.tenantId, invoiceId, dto.amount);
  }

  @Post('webhook/yookassa')
  @Public()
  @ApiOperation({ summary: 'Вебхук ЮKassa' })
  handleWebhook(@Body() body: YookassaWebhookDto) {
    return this.paymentsService.handleWebhook(body);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Все платежи' })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.findAll(
      user.tenantId,
      page ? +page : 1,
      limit ? +limit : 20,
    );
  }

  @Get('invoice/:invoiceId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Платежи по счёту' })
  findByInvoice(
    @CurrentUser() user: any,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    return this.paymentsService.findByInvoice(user.tenantId, invoiceId);
  }
}
