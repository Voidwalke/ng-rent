import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RentIndexationService } from './rent-indexation.service';
import { IndexationPreviewDto, IndexationApplyDto } from './dto/indexation.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Индексация аренды')
@ApiBearerAuth()
@Controller('rent-indexation')
@Roles(UserRole.admin)
export class RentIndexationController {
  constructor(private readonly service: RentIndexationService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Предпросмотр индексации' })
  preview(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: IndexationPreviewDto,
  ) {
    return this.service.preview(tenantId, dto.rate);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Применить индексацию' })
  apply(
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: IndexationApplyDto,
  ) {
    return this.service.apply(tenantId, dto.rate, dto.contractIds);
  }
}
