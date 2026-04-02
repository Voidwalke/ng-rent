import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список всех организаций */
  async findAll() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Возвращает организацию по идентификатору */
  async findOne(id: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Организация не найдена');
    return tenant;
  }

  /** Создаёт новую организацию */
  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: dto });
  }

  /** Обновляет данные организации */
  async update(id: number, dto: UpdateTenantDto) {
    await this.findOne(id);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  /** Деактивирует организацию (soft delete) */
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Переключает активность организации */
  async toggle(id: number) {
    const tenant = await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: !tenant.isActive },
    });
  }
}
