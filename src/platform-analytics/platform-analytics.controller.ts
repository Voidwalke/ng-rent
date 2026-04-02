import { Controller, Get, Post, Patch, Param, Query, Body, ParseIntPipe, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Аналитика платформы (суперадмин)')
@ApiBearerAuth()
@Controller('platform/analytics')
@Roles(UserRole.super_admin)
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

  @Get('audit')
  @ApiOperation({ summary: 'Аудит-лог платформы' })
  getAuditLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.analyticsService.getAuditLogs(page ? +page : 1, limit ? +limit : 30);
  }

  @Get('system')
  @ApiOperation({ summary: 'Статус системы' })
  getSystemHealth() {
    return this.analyticsService.getSystemHealth();
  }

  @Get('tenants/:id/detail')
  @ApiOperation({ summary: 'Детали тенанта' })
  getTenantDetail(@Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.getTenantDetail(id);
  }

  @Patch('tenants/:id/plan')
  @ApiOperation({ summary: 'Сменить тариф тенанту' })
  changePlan(@Param('id', ParseIntPipe) id: number, @Body('plan') plan: string) {
    return this.analyticsService.changeTenantPlan(id, plan);
  }

  @Patch('tenants/:id/extend-trial')
  @ApiOperation({ summary: 'Продлить триал' })
  extendTrial(@Param('id', ParseIntPipe) id: number, @Body('days') days: number) {
    return this.analyticsService.extendTrial(id, days || 14);
  }

  @Patch('users/:id/reset-password')
  @ApiOperation({ summary: 'Сбросить пароль юзеру' })
  resetPassword(@Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.resetUserPassword(id);
  }

  @Patch('users/:id/toggle')
  @ApiOperation({ summary: 'Заблокировать/разблокировать юзера' })
  toggleUser(@Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.toggleUser(id);
  }

  @Patch('users/:id/force-logout')
  @ApiOperation({ summary: 'Принудительный logout' })
  forceLogout(@Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.forceLogout(id);
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Массовое оповещение' })
  broadcast(@Body() body: { title: string; message: string }) {
    return this.analyticsService.broadcastNotification(body.title, body.message);
  }

  @Get('export')
  @ApiOperation({ summary: 'Экспорт платформы' })
  async exportPlatform(@Res() res: Response) {
    const data = await this.analyticsService.exportPlatform();
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="platform-export-${new Date().toISOString().slice(0, 10)}.json"` });
    res.json(data);
  }

  @Get('users')
  @ApiOperation({ summary: 'Все пользователи платформы' })
  getAllUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.analyticsService.getAllUsers(page ? +page : 1, limit ? +limit : 20);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Все платежи платформы' })
  getAllPayments(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.analyticsService.getAllPayments(page ? +page : 1, limit ? +limit : 20);
  }
}
