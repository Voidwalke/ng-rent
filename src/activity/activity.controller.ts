import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { ActivityQueryDto } from './dto/activity-query.dto';

@ApiTags('Лента событий')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Лента последних событий организации' })
  getFeed(@CurrentUser() user: any, @Query() query: ActivityQueryDto) {
    return this.activityService.getFeed(
      user.tenantId,
      query.page ? +query.page : 1,
      query.limit ? +query.limit : 30,
    );
  }

  @Get(':entityType/:entityId')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'События по конкретной сущности' })
  getByEntity(
    @CurrentUser() user: any,
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
    return this.activityService.getByEntity(
      user.tenantId,
      entityType,
      entityId,
    );
  }
}
