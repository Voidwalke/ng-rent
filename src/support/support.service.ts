import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  /** Создаёт тикет */
  async createTicket(
    tenantId: number,
    userId: number,
    data: {
      subject: string;
      category?: string;
      priority?: 'low' | 'medium' | 'high';
      message: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          tenantId,
          userId,
          subject: data.subject,
          category: data.category || 'other',
          priority: data.priority || 'medium',
        },
      });

      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: userId,
          senderType: 'user',
          message: data.message,
        },
      });

      return ticket;
    });
  }

  /** Возвращает список тикетов */
  async findAll(
    tenantId: number,
    filters?: { status?: TicketStatus; page?: number; limit?: number },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Возвращает тикет с сообщениями */
  async findOne(tenantId: number, id: number) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        messages: {
          include: { sender: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Тикет не найден');
    return ticket;
  }

  /** Добавляет сообщение */
  async addMessage(
    tenantId: number,
    ticketId: number,
    userId: number,
    message: string,
  ) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new NotFoundException('Тикет не найден');
    if (ticket.status === 'closed')
      throw new BadRequestException('Тикет закрыт');

    // Если закрыт — переоткрываем
    if (ticket.status === 'resolved') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'open', resolvedAt: null },
      });
    }

    return this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderType: 'user',
        message,
      },
    });
  }

  /** Решает тикет */
  async resolve(tenantId: number, id: number) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, tenantId },
    });
    if (!ticket) throw new NotFoundException('Тикет не найден');

    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
  }

  /** Закрывает тикет */
  async close(tenantId: number, id: number) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, tenantId },
    });
    if (!ticket) throw new NotFoundException('Тикет не найден');

    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'closed', resolvedAt: ticket.resolvedAt || new Date() },
    });
  }
}
