import { Controller, Get, Post, Patch, Delete, Param, Query, Body, ParseIntPipe, Res } from '@nestjs/common';
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

  // ── Django-style Admin ──

  @Get('models')
  @ApiOperation({ summary: 'Список доступных моделей' })
  getModels() {
    return this.analyticsService.getAvailableModels();
  }

  @Get('models/:model/schema')
  @ApiOperation({ summary: 'Схема полей модели' })
  getModelSchema(@Param('model') model: string) {
    return this.analyticsService.getModelFields(model);
  }

  @Get('models/:model')
  @ApiOperation({ summary: 'Список записей модели' })
  browseModel(
    @Param('model') model: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.analyticsService.browseModel(model, { page: page ? +page : 1, limit: limit ? +limit : 25, search, sort, order });
  }

  @Get('models/:model/:id')
  @ApiOperation({ summary: 'Запись модели по ID' })
  getRecord(@Param('model') model: string, @Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.getModelRecord(model, id);
  }

  @Post('models/:model')
  @ApiOperation({ summary: 'Создать запись модели' })
  createRecord(@Param('model') model: string, @Body() body: any) {
    return this.analyticsService.createModelRecord(model, body);
  }

  @Post('models/:model/bulk-delete')
  @ApiOperation({ summary: 'Массовое удаление записей' })
  bulkDelete(@Param('model') model: string, @Body('ids') ids: number[]) {
    return this.analyticsService.bulkDeleteModelRecords(model, ids);
  }

  @Patch('models/:model/:id')
  @ApiOperation({ summary: 'Обновить запись модели' })
  updateRecord(@Param('model') model: string, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.analyticsService.updateModelRecord(model, id, body);
  }

  @Delete('models/:model/:id')
  @ApiOperation({ summary: 'Удалить запись модели' })
  deleteRecord(@Param('model') model: string, @Param('id', ParseIntPipe) id: number) {
    return this.analyticsService.deleteModelRecord(model, id);
  }

  // ── Analytics ──

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
