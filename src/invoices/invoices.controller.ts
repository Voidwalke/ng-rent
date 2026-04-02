import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiProduces } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreditNoteDto } from './dto/credit-note.dto';
import { ContractGeneratorService } from '../contracts/contract-generator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Счета')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly contractGenerator: ContractGeneratorService,
    private readonly prisma: PrismaService,
  ) {}

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
  @Roles(UserRole.admin, UserRole.manager)
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

  @Get(':id/document')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать счёт на оплату (PDF)' })
  @ApiProduces('application/pdf')
  async downloadInvoiceDoc(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOne(id, tenantId);
    const tenantOrg = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const contract = invoice.contract;
    const pdfBuffer = await this.contractGenerator.generateInvoiceDocPdf({
      tenant: tenantOrg || {},
      client: contract?.client || {},
      property: (contract as any)?.unit?.property || {},
      unit: (contract as any)?.unit || {},
      invoice,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice_${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get(':id/schet-faktura')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать счёт-фактуру (PDF)' })
  @ApiProduces('application/pdf')
  async downloadSchetFaktura(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOne(id, tenantId);
    const tenantOrg = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const contract = invoice.contract;
    const pdfBuffer = await this.contractGenerator.generateSchetFakturaPdf({
      tenant: tenantOrg || {},
      client: contract?.client || {},
      property: (contract as any)?.unit?.property || {},
      unit: (contract as any)?.unit || {},
      invoice,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="schet_faktura_${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post('generate-batch')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Массовая генерация счетов по договорам' })
  generateBatch(
    @CurrentUser('tenantId') tenantId: number,
    @Body() body: { contractIds: number[] },
  ) {
    return this.invoicesService.generateBatch(tenantId, body.contractIds);
  }
}
