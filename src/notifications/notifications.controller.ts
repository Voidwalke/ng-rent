import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators';

@ApiTags('Уведомления')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Список уведомлений' })
  @ApiQuery({ name: 'is_read', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser() user: any,
    @Query('is_read') isRead?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findAll(user.id, {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      type,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Пометить как прочитанное' })
  markAsRead(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Пометить все как прочитанные' })
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Количество непрочитанных' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.id);
  }
}
