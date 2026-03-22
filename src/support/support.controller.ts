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
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { TicketStatus, UserRole } from '@prisma/client';

@ApiTags('Поддержка')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @ApiOperation({ summary: 'Создать тикет' })
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateTicketDto,
  ) {
    return this.supportService.createTicket(user.tenantId, user.id, dto);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Список тикетов' })
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: TicketStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.supportService.findAll(user.tenantId, {
      status,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Тикет с историей сообщений' })
  findOne(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.findOne(user.tenantId, id);
  }

  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Добавить сообщение в тикет' })
  addMessage(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMessageDto,
  ) {
    return this.supportService.addMessage(user.tenantId, id, user.id, dto.message);
  }

  @Patch('tickets/:id/resolve')
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: 'Решить тикет' })
  resolve(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.resolve(user.tenantId, id);
  }

  @Patch('tickets/:id/close')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Закрыть тикет' })
  close(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.close(user.tenantId, id);
  }
}
