import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantPortalService } from './tenant-portal.service';
import { CurrentUser } from '../common/decorators';

@ApiTags('Личный кабинет арендатора')
@ApiBearerAuth()
@Controller('my')
export class TenantPortalController {
  constructor(private readonly portalService: TenantPortalService) {}

  @Get('applications')
  @ApiOperation({ summary: 'Мои заявки на аренду' })
  getMyApplications(@CurrentUser() user: any) {
    return this.portalService.getMyApplications(user.tenantId, user.id);
  }

  @Post('applications')
  @ApiOperation({ summary: 'Подать заявку через каталог' })
  createApplication(
    @CurrentUser() user: any,
    @Body()
    body: {
      unitId: number;
      desiredStart: string;
      desiredEnd: string;
      desiredPrice?: number;
      comment?: string;
    },
  ) {
    return this.portalService.createApplication(user.tenantId, user.id, body);
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Детали заявки' })
  getApplication(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.portalService.getApplication(user.tenantId, user.id, id);
  }

  @Get('contracts')
  @ApiOperation({ summary: 'Мои договоры' })
  getMyContracts(@CurrentUser() user: any) {
    return this.portalService.getMyContracts(user.tenantId, user.id);
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Детали договора' })
  getContract(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portalService.getContract(user.tenantId, user.id, id);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Мои счета' })
  getMyInvoices(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.portalService.getMyInvoices(user.tenantId, user.id, status);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Детали счёта' })
  getInvoice(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portalService.getInvoice(user.tenantId, user.id, id);
  }

  @Post('invoices/:id/pay')
  @ApiOperation({ summary: 'Инициировать оплату' })
  payInvoice(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.portalService.payInvoice(user.tenantId, user.id, id);
  }

  @Get('access-cards')
  @ApiOperation({ summary: 'Мои карты доступа' })
  getMyAccessCards(@CurrentUser() user: any) {
    return this.portalService.getMyAccessCards(user.tenantId, user.id);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Мои документы' })
  getMyDocuments(@CurrentUser() user: any) {
    return this.portalService.getMyDocuments(user.tenantId, user.id);
  }
}
