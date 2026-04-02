import { Controller, Get, Post, Delete, Body, Req, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { CurrentUser } from '../common/decorators';
import { RecordConsentDto } from './dto/record-consent.dto';

@ApiTags('152-ФЗ / Персональные данные')
@ApiBearerAuth()
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post('consent')
  @ApiOperation({ summary: 'Дать согласие на обработку ПД' })
  recordConsent(
    @CurrentUser() user: any,
    @Body() dto: RecordConsentDto,
    @Req() req: any,
  ) {
    return this.complianceService.recordConsent(user.id, dto.type, req.ip);
  }

  @Get('consents')
  @ApiOperation({ summary: 'Список активных согласий' })
  getConsents(@CurrentUser() user: any) {
    return this.complianceService.getUserConsents(user.id);
  }

  @Delete('consent/:id')
  @ApiOperation({ summary: 'Отозвать согласие на обработку ПД' })
  revokeConsent(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.complianceService.revokeConsent(user.id, id);
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
  @ApiOperation({ summary: 'Запрос на удаление аккаунта' })
  deleteAccount(@CurrentUser() user: any) {
    return this.complianceService.requestAccountDeletion(user.id);
  }
}
