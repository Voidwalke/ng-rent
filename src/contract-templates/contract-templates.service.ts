import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number) {
    return this.prisma.contractTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const tpl = await this.prisma.contractTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!tpl) throw new NotFoundException('Шаблон не найден');
    return tpl;
  }

  async create(tenantId: number, dto: any) {
    if (dto.isDefault) {
      await this.prisma.contractTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.contractTemplate.create({
      data: { ...dto, tenantId },
    });
  }

  async update(id: number, tenantId: number, dto: any) {
    await this.findOne(id, tenantId);
    if (dto.isDefault) {
      await this.prisma.contractTemplate.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.contractTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.prisma.contractTemplate.delete({ where: { id } });
    return { message: 'Шаблон удалён' };
  }
}
