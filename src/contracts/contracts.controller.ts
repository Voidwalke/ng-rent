import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ContractsService } from './contracts.service';
import { ContractGeneratorService } from './contract-generator.service';
import { EdoService } from './edo.service';
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
  findAll(@CurrentUser('tenantId') tenantId: number) {
    return this.contractsService.findAll(tenantId);
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

  @Patch(':id/terminate')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Расторгнуть договор' })
  terminate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.contractsService.terminate(id, undefined, tenantId);
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

  @Post(':id/edo/send')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Отправить договор на подпись через ЭДО' })
  sendToEdo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') _tenantId: number,
  ) {
    return this.edo.sendForSigning(id);
  }

  @Get(':id/edo/status')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Проверить статус подписания в ЭДО' })
  checkEdoStatus(@Param('id', ParseIntPipe) id: number) {
    return this.edo.checkStatus(id);
  }

  @Get(':id/edo/download')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Скачать подписанный документ из ЭДО' })
  @ApiProduces('application/pdf')
  async downloadSigned(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.edo.downloadSigned(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract_${id}_signed.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
