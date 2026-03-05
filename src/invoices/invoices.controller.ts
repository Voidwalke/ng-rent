import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CurrentUser } from '../common/decorators';

@ApiTags('Счета')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Список счетов' })
  @ApiQuery({ name: 'status', required: false })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query('status') status?: string,
  ) {
    return this.invoicesService.findAll(tenantId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали счёта' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Оплатить счёт' })
  pay(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.pay(id);
  }
}
