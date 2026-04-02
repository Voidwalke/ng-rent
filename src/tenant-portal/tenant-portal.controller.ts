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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantPortalService } from './tenant-portal.service';
import { CreatePortalApplicationDto } from './dto/create-portal-application.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateMaintenanceRequestDto } from './dto/create-maintenance-request.dto';
import { CurrentUser } from '../common/decorators';

@ApiTags('Личный кабинет арендатора')
@ApiBearerAuth()
@Controller('my')
export class TenantPortalController {
  constructor(private readonly portalService: TenantPortalService) {}

  @Get('applications')
  @ApiOperation({ summary: 'Мои заявки на аренду' })
  getMyApplications(@CurrentUser() user: any) {
    return this.portalService.getMyApplications(user.tenantId, user.id);
  }

  @Post('applications')
  @ApiOperation({ summary: 'Подать заявку через каталог' })
  createApplication(
    @CurrentUser() user: any,
    @Body() dto: CreatePortalApplicationDto,
  ) {
    return this.portalService.createApplication(user.tenantId, user.id, dto);
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Детали заявки' })
  getApplication(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getApplication(user.tenantId, user.id, id);
  }

  @Get('contracts')
  @ApiOperation({ summary: 'Мои договоры' })
  getMyContracts(@CurrentUser() user: any) {
    return this.portalService.getMyContracts(user.tenantId, user.id);
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Детали договора' })
  getContract(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portalService.getContract(user.tenantId, user.id, id);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Мои счета' })
  getMyInvoices(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.portalService.getMyInvoices(user.tenantId, user.id, status);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Детали счёта' })
  getInvoice(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portalService.getInvoice(user.tenantId, user.id, id);
  }

  @Post('invoices/:id/pay')
  @ApiOperation({ summary: 'Инициировать оплату' })
  payInvoice(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portalService.payInvoice(user.tenantId, user.id, id);
  }

  @Get('access-cards')
  @ApiOperation({ summary: 'Мои карты доступа' })
  getMyAccessCards(@CurrentUser() user: any) {
    return this.portalService.getMyAccessCards(user.tenantId, user.id);
  }

  @Get('access-cards/:id/qr')
  @ApiOperation({ summary: 'QR-код карты доступа' })
  getCardQr(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getCardQr(user.tenantId, user.id, id);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Мои документы' })
  getMyDocuments(@CurrentUser() user: any) {
    return this.portalService.getMyDocuments(user.tenantId, user.id);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Мой профиль' })
  getProfile(@CurrentUser() user: any) {
    return this.portalService.getProfile(user.tenantId, user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Обновить профиль / данные компании' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.portalService.updateProfile(user.tenantId, user.id, dto);
  }

  @Get('maintenance')
  @ApiOperation({ summary: 'Мои заявки на ремонт' })
  getMyMaintenance(@CurrentUser() user: any) {
    return this.portalService.getMyMaintenance(user.tenantId, user.id);
  }

  @Post('maintenance')
  @ApiOperation({ summary: 'Создать заявку на ремонт' })
  createMaintenance(
    @CurrentUser() user: any,
    @Body() dto: CreateMaintenanceRequestDto,
  ) {
    return this.portalService.createMaintenance(user.tenantId, user.id, dto);
  }

  @Patch('contracts/:id/accept')
  @ApiOperation({ summary: 'Принять / подписать договор арендатором' })
  acceptContract(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.acceptContract(user.tenantId, user.id, id);
  }

  @Get('export/invoices/excel')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспорт моих счетов в Excel' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportMyInvoicesExcel(@CurrentUser() user: any, @Res() res: Response) {
    const buffer = await this.portalService.exportMyInvoicesExcel(user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="my_invoices_${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/contracts/excel')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспорт моих договоров в Excel' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportMyContractsExcel(@CurrentUser() user: any, @Res() res: Response) {
    const buffer = await this.portalService.exportMyContractsExcel(user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="my_contracts_${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/acts/excel')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспорт моих актов в Excel' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportMyActsExcel(@CurrentUser() user: any, @Res() res: Response) {
    const buffer = await this.portalService.exportMyActsExcel(user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="my_acts_${date}.xlsx"`,
    });
    res.send(buffer);
  }
}
