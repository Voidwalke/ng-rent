import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number) {
    return this.prisma.client.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, tenantId?: number) {
    const client = await this.prisma.client.findFirst({
      where: { id, ...(tenantId && { tenantId }) },
    });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  async create(tenantId: number, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: { ...dto, tenantId },
    });
  }
}
