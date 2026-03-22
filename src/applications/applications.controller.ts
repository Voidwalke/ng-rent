import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Заявки на аренду')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Список заявок' })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.applicationsService.findAll(tenantId, {
      status,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали заявки' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.applicationsService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать заявку' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(tenantId, dto);
  }

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Отправить заявку на рассмотрение' })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.applicationsService.submit(id, tenantId);
  }

  @Patch(':id/review')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Взять заявку в работу' })
  review(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.applicationsService.review(id, userId, tenantId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Одобрить заявку' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.applicationsService.approve(id, userId, tenantId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Отклонить заявку' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.applicationsService.reject(id, userId, tenantId);
  }
}
