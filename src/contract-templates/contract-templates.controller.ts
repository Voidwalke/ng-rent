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
import { ContractTemplatesService } from './contract-templates.service';
import { ContractGeneratorService } from '../contracts/contract-generator.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Шаблоны договоров')
@ApiBearerAuth()
@Controller('contract-templates')
@Roles(UserRole.admin, UserRole.manager)
export class ContractTemplatesController {
  constructor(
    private readonly templatesService: ContractTemplatesService,
    private readonly generator: ContractGeneratorService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список шаблонов договоров' })
  findAll(@CurrentUser('tenantId') tenantId: number) {
    return this.templatesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить шаблон' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.templatesService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать шаблон договора' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templatesService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить шаблон' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(id, tenantId, dto);
  }

  @Get('variables/:type')
  @ApiOperation({ summary: 'Доступные переменные для шаблона' })
  getVariables(@Param('type') type: string) {
    return {
      type,
      variables: this.generator.getTemplateVariables(type),
      description: 'Используйте {{переменная}} в HTML-шаблоне. Пример: {{tenant.name}}',
    };
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Удалить шаблон' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.templatesService.remove(id, tenantId);
  }
}
