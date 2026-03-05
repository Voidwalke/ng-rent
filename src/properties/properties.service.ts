import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number) {
    return this.prisma.property.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { units: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { units: { where: { deletedAt: null } } },
    });
    if (!property || property.deletedAt) {
      throw new NotFoundException('Объект не найден');
    }
    return property;
  }

  async create(tenantId: number, dto: CreatePropertyDto) {
    return this.prisma.property.create({
      data: { ...dto, tenantId },
    });
  }

  async update(id: number, dto: UpdatePropertyDto) {
    await this.findOne(id);
    return this.prisma.property.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
