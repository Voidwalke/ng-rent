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
  ApiQuery,
} from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Заявки на ремонт')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @ApiOperation({ summary: 'Список заявок на ремонт' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'propertyId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('status') status?: string,
    @Query('propertyId') propertyId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.maintenanceService.findAll(tenantId, {
      status,
      propertyId: propertyId ? +propertyId : undefined,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали заявки на ремонт' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.maintenanceService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать заявку на ремонт' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.maintenanceService.create(tenantId, userId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Обновить заявку на ремонт' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.maintenanceService.update(id, tenantId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Удалить заявку на ремонт' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.maintenanceService.remove(id, tenantId);
  }
}
