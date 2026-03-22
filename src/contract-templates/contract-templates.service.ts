import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список шаблонов договоров */
  async findAll(tenantId: number) {
    return this.prisma.contractTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Возвращает шаблон договора по идентификатору */
  async findOne(id: number, tenantId: number) {
    const tpl = await this.prisma.contractTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!tpl) throw new NotFoundException('Шаблон не найден');
    return tpl;
  }

  /** Создаёт шаблон договора */
  async create(tenantId: number, dto: any) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.contractTemplate.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.contractTemplate.create({
        data: { ...dto, tenantId },
      });
    });
  }

  /** Обновляет шаблон договора */
  async update(id: number, tenantId: number, dto: any) {
    await this.findOne(id, tenantId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.contractTemplate.updateMany({
          where: { tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.contractTemplate.update({
        where: { id },
        data: dto,
      });
    });
  }

  /** Удаляет шаблон договора */
  async remove(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.prisma.contractTemplate.delete({ where: { id } });
    return { message: 'Шаблон удалён' };
  }
}
