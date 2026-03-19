import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Объекты недвижимости')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'Список объектов с фильтрами' })
  @ApiResponse({ status: 200, description: 'Список объектов' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['office', 'retail', 'warehouse', 'coworking'],
  })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'isPublished', required: false, type: Boolean })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('type') type?: string,
    @Query('city') city?: string,
    @Query('isPublished') isPublished?: string,
  ) {
    return this.propertiesService.findAll(tenantId, {
      type,
      city,
      isPublished:
        isPublished !== undefined ? isPublished === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить объект с помещениями' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.propertiesService.findOne(id, tenantId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Статистика занятости объекта' })
  getStats(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.propertiesService.getStats(id, tenantId);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Создать объект' })
  @ApiResponse({ status: 201, description: 'Объект создан' })
  @ApiResponse({ status: 403, description: 'Недостаточно прав' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Обновить объект' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.propertiesService.update(id, dto, tenantId);
  }

  @Patch(':id/publish')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Опубликовать объект' })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.propertiesService.publish(id, tenantId);
  }

  @Patch(':id/unpublish')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Снять объект с публикации' })
  unpublish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.propertiesService.unpublish(id, tenantId);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Удалить объект (soft delete)' })
  @ApiResponse({ status: 200, description: 'Объект удалён' })
  @ApiResponse({ status: 404, description: 'Объект не найден' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.propertiesService.remove(id, tenantId);
  }
}
