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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { FilterUnitDto } from './dto/filter-unit.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Помещения')
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Список помещений с фильтрами и пагинацией' })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query() filter: FilterUnitDto,
  ) {
    return this.unitsService.findAll(tenantId, filter);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить помещение' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.unitsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Создать помещение' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateUnitDto,
  ) {
    return this.unitsService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Обновить помещение' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(id, dto);
  }

  @Patch(':id/maintenance')
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Перевести на обслуживание' })
  setMaintenance(@Param('id', ParseIntPipe) id: number) {
    return this.unitsService.setMaintenance(id);
  }

  @Patch(':id/available')
  @ApiBearerAuth()
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Вернуть из обслуживания' })
  setAvailable(@Param('id', ParseIntPipe) id: number) {
    return this.unitsService.setAvailable(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Удалить помещение' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.unitsService.remove(id);
  }
}
