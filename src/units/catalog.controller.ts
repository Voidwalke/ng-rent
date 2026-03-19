import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { FilterUnitDto } from './dto/filter-unit.dto';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Каталог (публичный)')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly unitsService: UnitsService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('properties')
  @ApiOperation({ summary: 'Опубликованные объекты недвижимости' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'city', required: false })
  async findProperties(
    @Query('type') type?: string,
    @Query('city') city?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const where: any = { isPublished: true, deletedAt: null };
    if (type) where.type = type;
    if (city) where.city = city;

    const p = page ? +page : 1;
    const l = limit ? +limit : 20;

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: (p - 1) * l,
        take: l,
        include: {
          _count: {
            select: {
              units: { where: { status: 'available', deletedAt: null } },
            },
          },
          tenant: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count({ where }),
    ]);

    return { data, total, page: p, limit: l, pages: Math.ceil(total / l) };
  }

  @Public()
  @Get('properties/:id')
  @ApiOperation({ summary: 'Объект с доступными помещениями' })
  async findProperty(@Param('id', ParseIntPipe) id: number) {
    const property = await this.prisma.property.findFirst({
      where: { id, isPublished: true, deletedAt: null },
      include: {
        units: {
          where: { status: 'available', deletedAt: null },
          orderBy: { priceMonth: 'asc' },
        },
        tenant: { select: { name: true } },
      },
    });
    if (!property) throw new NotFoundException('Объект не найден');
    return property;
  }

  @Public()
  @Get('units')
  @ApiOperation({ summary: 'Доступные помещения из опубликованных объектов' })
  findCatalog(@Query() filter: FilterUnitDto) {
    return this.unitsService.findCatalog(filter);
  }
}
