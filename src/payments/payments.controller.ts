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
import { CurrentUser, Public, Roles } from '../common/decorators';

@ApiTags('Платежи')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('invoice/:invoiceId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать платёж по счёту' })
  createPayment(
    @CurrentUser() user: any,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    return this.paymentsService.createPayment(user.tenantId, invoiceId);
  }

  @Post('webhook/yookassa')
  @Public()
  @ApiOperation({ summary: 'Вебхук ЮKassa' })
  handleWebhook(@Body() body: any, @Headers('x-signature') signature: string) {
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
