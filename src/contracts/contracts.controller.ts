import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Договоры')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @ApiOperation({ summary: 'Список договоров' })
  findAll(@CurrentUser('tenantId') tenantId: number) {
    return this.contractsService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали договора' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.contractsService.findOne(id, tenantId);
  }

  @Post(':applicationId/generate')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Сгенерировать договор по заявке' })
  generate(
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.contractsService.generateFromApplication(
      applicationId,
      tenantId,
    );
  }

  @Patch(':id/sign')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Подписать договор' })
  sign(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.sign(id);
  }

  @Patch(':id/terminate')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Расторгнуть договор' })
  terminate(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.terminate(id);
  }
}
