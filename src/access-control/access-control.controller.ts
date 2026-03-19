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
import { AccessControlService } from './access-control.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('СКУД / Карты доступа')
@ApiBearerAuth()
@Controller('access-cards')
@Roles(UserRole.admin, UserRole.manager)
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get()
  @ApiOperation({ summary: 'Список карт доступа' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('clientId') clientId?: string,
    @Query('contractId') contractId?: string,
  ) {
    return this.accessControlService.findAll(tenantId, {
      clientId: clientId ? parseInt(clientId) : undefined,
      contractId: contractId ? parseInt(contractId) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить карту' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.accessControlService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Выдать карту доступа' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body()
    body: {
      clientId: number;
      contractId: number;
      cardNumber: string;
      holderName?: string;
      zones?: string[];
    },
  ) {
    return this.accessControlService.create(tenantId, body);
  }

  @Patch(':id/block')
  @ApiOperation({ summary: 'Заблокировать карту' })
  block(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason: string },
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.accessControlService.block(id, body.reason, tenantId);
  }

  @Patch(':id/unblock')
  @ApiOperation({ summary: 'Разблокировать карту' })
  unblock(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.accessControlService.unblock(id, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить карту' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.accessControlService.remove(id, tenantId);
  }
}
