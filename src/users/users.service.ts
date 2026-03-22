import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Возвращает список пользователей тенанта */
  async findAll(tenantId: number) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Возвращает пользователя по идентификатору */
  async findOne(id: number, tenantId?: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...(tenantId && { tenantId }), deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        tenantId: true,
        is2faEnabled: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  /** Создаёт нового пользователя */
  async create(tenantId: number, dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role || 'manager',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });
  }

  /** Обновляет данные пользователя */
  async update(id: number, dto: UpdateUserDto, tenantId?: number) {
    await this.findOne(id, tenantId);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });
  }

  /** Мягкое удаление пользователя */
  async remove(id: number, tenantId?: number) {
    await this.findOne(id, tenantId);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }
}
