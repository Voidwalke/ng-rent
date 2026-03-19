import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Пользователи')
@ApiBearerAuth()
@Controller('users')
@Roles(UserRole.admin) // управление пользователями — только админ
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Список пользователей организации' })
  findAll(@CurrentUser('tenantId') tenantId: number) {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить пользователя' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.usersService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать пользователя' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить пользователя' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.usersService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить пользователя' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.usersService.remove(id, tenantId);
  }
}
