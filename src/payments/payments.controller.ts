import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { YookassaWebhookDto } from './dto/yookassa-webhook.dto';
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
    @Body('amount') amount?: number,
  ) {
    return this.paymentsService.refund(user.tenantId, invoiceId, amount);
  }

  @Post('webhook/yookassa')
  @Public()
  @ApiOperation({ summary: 'Вебхук ЮKassa' })
  handleWebhook(@Body() body: YookassaWebhookDto, @Headers('x-signature') signature: string) {
    return this.paymentsService.handleWebhook(body, signature);
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
