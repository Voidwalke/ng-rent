import { Controller, Get, Res, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Аналитика')
@ApiBearerAuth()
@Controller('analytics')
@Roles(UserRole.admin, UserRole.manager)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPI дашборд' })
  getDashboard(@CurrentUser('tenantId') tenantId: number) {
    return this.analyticsService.getDashboard(tenantId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Выручка по месяцам' })
  @ApiQuery({ name: 'months', required: false, example: 6 })
  getRevenue(
    @CurrentUser('tenantId') tenantId: number,
    @Query('months') months?: string,
  ) {
    return this.analyticsService.getRevenue(tenantId, months ? +months : 6);
  }

  @Get('aged-debt')
  @ApiOperation({ summary: 'Просроченная задолженность по срокам' })
  getAgedDebt(@CurrentUser('tenantId') tenantId: number) {
    return this.analyticsService.getAgedDebt(tenantId);
  }

  @Get('occupancy')
  @ApiOperation({ summary: 'Заполняемость по объектам' })
  getOccupancy(@CurrentUser('tenantId') tenantId: number) {
    return this.analyticsService.getOccupancy(tenantId);
  }

  @Get('cashflow')
  @ApiOperation({ summary: 'Денежный поток (начисления vs оплаты)' })
  @ApiQuery({ name: 'months', required: false, example: 6 })
  getCashflow(
    @CurrentUser('tenantId') tenantId: number,
    @Query('months') months?: string,
  ) {
    return this.analyticsService.getCashflow(tenantId, months ? +months : 6);
  }

  @Get('vacancy-cost')
  @ApiOperation({ summary: 'Стоимость простоя помещений' })
  getVacancyCost(@CurrentUser('tenantId') tenantId: number) {
    return this.analyticsService.getVacancyCost(tenantId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Экспорт аналитики (JSON)' })
  @ApiProduces('application/json')
  async exportAnalytics(
    @CurrentUser('tenantId') tenantId: number,
    @Res() res: Response,
  ) {
    const data = await this.analyticsService.exportAnalytics(tenantId);
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="analytics_${tenantId}_${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.json(data);
  }
}
