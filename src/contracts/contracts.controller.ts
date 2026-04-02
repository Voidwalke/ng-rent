import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ContractsService } from './contracts.service';
import { ContractGeneratorService } from './contract-generator.service';
import { EdoService } from './edo.service';
import { RenewContractDto } from './dto/renew-contract.dto';
import { ExtendContractDto } from './dto/extend-contract.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Договоры')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly contractGenerator: ContractGeneratorService,
    private readonly edo: EdoService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список договоров' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contractsService.findAll(
      tenantId,
      status,
      page ? +page : undefined,
      limit ? +limit : undefined,
    );
  }

  @Get('expiring')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Договоры с истекающим сроком' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  findExpiring(
    @CurrentUser('tenantId') tenantId: number,
    @Query('days') days?: string,
  ) {
    return this.contractsService.findExpiring(tenantId, days ? +days : 30);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали договора' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.contractsService.findOne(id, tenantId);
  }

  @Post(':applicationId/generate')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Сгенерировать договор по заявке' })
  generate(
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.contractsService.generateFromApplication(
      applicationId,
      tenantId,
    );
  }

  @Patch(':id/sign')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Подписать договор' })
  sign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.contractsService.sign(id, tenantId);
  }

  @Post(':id/renew')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Продлить договор (создать новый)' })
  renew(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: RenewContractDto,
  ) {
    return this.contractsService.renew(id, tenantId, dto);
  }

  @Patch(':id/extend')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Продлить срок текущего договора' })
  extend(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: ExtendContractDto,
  ) {
    return this.contractsService.extend(id, tenantId, dto.newEndDate);
  }

  @Patch(':id/terminate')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Расторгнуть договор' })
  terminate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() body: { reason?: string; depositAction?: 'return' | 'withhold' | 'partial'; depositWithheldAmount?: number; depositWithheldReason?: string },
  ) {
    return this.contractsService.terminate(id, body.reason, tenantId, body.depositAction, body.depositWithheldAmount, body.depositWithheldReason);
  }

  @Get(':id/pdf')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать PDF договора' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const contract = await this.contractsService.findOne(id, tenantId);
    const tenantOrg = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const pdfBuffer = await this.contractGenerator.generatePdf({
      tenant: tenantOrg || {},
      client: contract.client || {},
      property: (contract as any).unit?.property || {},
      unit: contract.unit || {},
      contract,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract_${contract.contractNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  @Get(':id/handover-act')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать акт приёма-передачи' })
  @ApiProduces('application/pdf')
  async downloadHandoverAct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const contract = await this.contractsService.findOne(id, tenantId);
    const tenantOrg = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const pdfBuffer = await this.contractGenerator.generateHandoverActPdf({
      tenant: tenantOrg || {},
      client: contract.client || {},
      property: (contract as any).unit?.property || {},
      unit: contract.unit || {},
      contract,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="handover_act_${contract.contractNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get(':id/reconciliation')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать акт сверки взаимных расчётов' })
  @ApiProduces('application/pdf')
  async downloadReconciliation(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const contract = await this.contractsService.findOne(id, tenantId);
    const tenantOrg = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    // Сбор данных по счетам и платежам
    const invoices = (contract.invoices || []).map((inv: any) => ({
      date: new Date(inv.createdAt).toLocaleDateString('ru-RU'),
      number: inv.invoiceNumber,
      amount: Number(inv.totalAmount).toLocaleString('ru-RU'),
    }));

    const payments = await this.prisma.payment.findMany({
      where: { invoiceId: { in: (contract.invoices || []).map((i: any) => i.id) } },
    });
    const paymentRows = payments.map((p: any) => ({
      date: new Date(p.createdAt).toLocaleDateString('ru-RU'),
      reference: p.externalId || `PAY-${p.id}`,
      amount: Number(p.amount).toLocaleString('ru-RU'),
    }));

    const totalDebited = (contract.invoices || []).reduce((s: number, i: any) => s + Number(i.totalAmount), 0);
    const totalCredited = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

    const pdfBuffer = await this.contractGenerator.generateReconciliationPdf({
      tenant: tenantOrg || {},
      client: contract.client || {},
      contract,
      invoices,
      payments: paymentRows,
      periodStart: new Date(contract.startDate).toLocaleDateString('ru-RU'),
      periodEnd: new Date().toLocaleDateString('ru-RU'),
      openingBalance: '0',
      totalDebited: totalDebited.toLocaleString('ru-RU'),
      totalCredited: totalCredited.toLocaleString('ru-RU'),
      closingBalance: (totalDebited - totalCredited).toLocaleString('ru-RU'),
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reconciliation_${contract.contractNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/amendment')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Сгенерировать дополнительное соглашение' })
  @ApiProduces('application/pdf')
  async generateAmendment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() body: { changes: string[] },
    @Res() res: Response,
  ) {
    const contract = await this.contractsService.findOne(id, tenantId);
    const tenantOrg = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    // Определение номера доп. соглашения
    const existingAmendments = await this.prisma.document.count({
      where: { tenantId, entityType: 'contract', entityId: id, category: 'amendment' },
    });

    const pdfBuffer = await this.contractGenerator.generateAmendmentPdf({
      tenant: tenantOrg || {},
      client: contract.client || {},
      contract,
      amendmentNumber: existingAmendments + 1,
      changes: body.changes,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="amendment_${contract.contractNumber}_${existingAmendments + 1}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/edo/send')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Отправить договор на подпись через ЭДО' })
  async sendToEdo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    await this.contractsService.findOne(id, tenantId);
    return this.edo.sendForSigning(id);
  }

  @Get(':id/edo/status')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Проверить статус подписания в ЭДО' })
  async checkEdoStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    await this.contractsService.findOne(id, tenantId);
    return this.edo.checkStatus(id);
  }

  @Get(':id/edo/download')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать подписанный документ из ЭДО' })
  @ApiProduces('application/pdf')
  async downloadSigned(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    await this.contractsService.findOne(id, tenantId);
    const pdfBuffer = await this.edo.downloadSigned(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract_${id}_signed.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
