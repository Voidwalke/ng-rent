import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { FilterUnitDto } from './dto/filter-unit.dto';
import { Public } from '../common/decorators';

@ApiTags('Каталог (публичный)')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly unitsService: UnitsService) {}

  @Public()
  @Get('units')
  @ApiOperation({ summary: 'Публичный каталог доступных помещений' })
  findCatalog(@Query() filter: FilterUnitDto) {
    return this.unitsService.findCatalog(filter);
  }
}
