import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
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
    return this.analyticsService.getRevenue(
      tenantId,
      months ? parseInt(months) : 6,
    );
  }
}
