import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreditNoteDto } from './dto/credit-note.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Счета')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Список счетов' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('status') status?: string,
    @Query('contractId') contractId?: string,
  ) {
    return this.invoicesService.findAll(tenantId, {
      status,
      contractId: contractId ? parseInt(contractId) : undefined,
    });
  }

  @Get('summary')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Сводка по счетам' })
  getSummary(@CurrentUser('tenantId') tenantId: number) {
    return this.invoicesService.getSummary(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали счёта' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.invoicesService.findOne(id, tenantId);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Подтвердить оплату' })
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayInvoiceDto,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.invoicesService.pay(
      id,
      dto.paidAmount,
      dto.paymentReference,
      tenantId,
    );
  }

  @Post()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Создать счёт вручную' })
  createManual(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.createManual(tenantId, dto);
  }

  @Post('credit-note')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Создать кредит-ноту (возврат)' })
  creditNote(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreditNoteDto,
  ) {
    return this.invoicesService.createCreditNote(tenantId, dto);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Отменить счёт' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.invoicesService.cancel(id, tenantId);
  }
}
