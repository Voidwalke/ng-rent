import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Настройки уведомлений')
@ApiBearerAuth()
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Получить настройки уведомлений' })
  getPreferences(@CurrentUser('id') userId: number) {
    return this.service.getPreferences(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Обновить настройки уведомлений' })
  updatePreferences(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.service.updatePreferences(userId, dto.settings);
  }

  @Get('webhooks')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Список webhooks' })
  getWebhooks(@CurrentUser('tenantId') tenantId: number) {
    return this.service.getWebhooks(tenantId);
  }

  @Post('webhooks')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Создать webhook' })
  createWebhook(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.service.createWebhook(tenantId, dto);
  }

  @Delete('webhooks/:id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Удалить webhook' })
  deleteWebhook(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.service.deleteWebhook(id, tenantId);
  }
}
