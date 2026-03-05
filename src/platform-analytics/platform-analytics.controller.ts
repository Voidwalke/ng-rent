import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { Roles } from '../common/decorators';

@ApiTags('Аналитика платформы (суперадмин)')
@ApiBearerAuth()
@Controller('platform/analytics')
@Roles('super_admin')
export class PlatformAnalyticsController {
  constructor(private readonly analyticsService: PlatformAnalyticsService) {}

  @Get('mrr')
  @ApiOperation({ summary: 'MRR / ARR' })
  getMrr() {
    return this.analyticsService.getMrr();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Статистика по организациям' })
  getTenantStats() {
    return this.analyticsService.getTenantStats();
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Воронка регистрации' })
  getFunnel() {
    return this.analyticsService.getFunnel();
  }

  @Get('churn')
  @ApiOperation({ summary: 'Отток' })
  getChurn() {
    return this.analyticsService.getChurn();
  }
}
