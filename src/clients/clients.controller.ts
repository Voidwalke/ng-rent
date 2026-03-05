import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CurrentUser } from '../common/decorators';

@ApiTags('Клиенты (арендаторы)')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Список клиентов' })
  findAll(@CurrentUser('tenantId') tenantId: number) {
    return this.clientsService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить клиента' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать клиента' })
  create(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientsService.create(tenantId, dto);
  }
}
