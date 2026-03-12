import { Controller, Get, Post, Delete, Body, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { CurrentUser } from '../common/decorators';

@ApiTags('152-ФЗ / Персональные данные')
@ApiBearerAuth()
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post('consent')
  @ApiOperation({ summary: 'Дать согласие на обработку ПД' })
  recordConsent(
    @CurrentUser() user: any,
    @Body('consentType') consentType: string,
    @Req() req: any,
  ) {
    return this.complianceService.recordConsent(
      user.id,
      user.tenantId,
      consentType,
      req.ip,
    );
  }

  @Delete('consent')
  @ApiOperation({ summary: 'Отозвать согласие на обработку ПД' })
  revokeConsent(
    @CurrentUser() user: any,
    @Body('consentType') consentType: string,
  ) {
    return this.complianceService.revokeConsent(user.id, consentType);
  }

  @Get('consents')
  @ApiOperation({ summary: 'Список действующих согласий' })
  getConsents(@CurrentUser() user: any) {
    return this.complianceService.getUserConsents(user.id);
  }

  @Post('data-export')
  @ApiOperation({ summary: 'Запросить экспорт персональных данных' })
  requestExport(@CurrentUser() user: any) {
    return this.complianceService.requestDataExport(user.id, user.tenantId);
  }

  @Get('data-export')
  @ApiOperation({ summary: 'Статус запросов на экспорт данных' })
  getExports(@CurrentUser() user: any) {
    return this.complianceService.getExportJobs(user.id);
  }

  @Post('delete-account')
  @ApiOperation({ summary: 'Запрос на удаление аккаунта (30 дней)' })
  deleteAccount(@CurrentUser() user: any) {
    return this.complianceService.requestAccountDeletion(user.id);
  }
}
