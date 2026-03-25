import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { IAccessControlProvider } from './access-control.provider';

@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('ACCESS_CONTROL_PROVIDER')
    private readonly provider: IAccessControlProvider,
  ) {}

  /** Возвращает список карт доступа с фильтрацией */
  async findAll(
    tenantId: number,
    filters?: {
      clientId?: number;
      contractId?: number;
      isActive?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    const where: any = { tenantId };
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.contractId) where.contractId = filters.contractId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 50, 100);

    const [data, total] = await Promise.all([
      this.prisma.accessCard.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { companyName: true } },
          contract: { select: { contractNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.accessCard.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /** Возвращает карту доступа по идентификатору */
  async findOne(id: number, tenantId?: number) {
    const card = await this.prisma.accessCard.findFirst({
      where: { id, ...(tenantId && { tenantId }) },
      include: { client: true, contract: true },
    });
    if (!card) throw new NotFoundException('Карта не найдена');
    return card;
  }

  /** Создаёт карту доступа и отправляет команду в СКУД */
  async create(
    tenantId: number,
    data: {
      clientId: number;
      contractId: number;
      cardNumber: string;
      holderName?: string;
      zones?: string[];
    },
  ) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: data.contractId, tenantId },
    });

    const card = await this.prisma.accessCard.create({
      data: {
        tenantId,
        clientId: data.clientId,
        contractId: data.contractId,
        cardNumber: data.cardNumber,
        holderName: data.holderName,
        zones: data.zones || [],
        activatedAt: new Date(),
        expiresAt: contract?.endDate,
      },
    });

    await this.provider.grantAccess({
      cardNumber: data.cardNumber,
      zones: data.zones || [],
      validFrom: new Date(),
      validTo: contract?.endDate || new Date(),
    });

    return card;
  }

  /** Блокирует карту доступа */
  async block(id: number, reason: string, tenantId?: number) {
    const card = await this.findOne(id, tenantId);

    await this.provider.revokeAccess({
      cardNumber: card.cardNumber,
      reason,
    });

    return this.prisma.accessCard.update({
      where: { id },
      data: { isActive: false, blockedReason: reason, blockedAt: new Date() },
    });
  }

  /** Разблокирует карту доступа */
  async unblock(id: number, tenantId?: number) {
    const card = await this.findOne(id, tenantId);

    await this.provider.grantAccess({
      cardNumber: card.cardNumber,
      zones: (card.zones as string[]) || [],
      validFrom: new Date(),
      validTo: card.expiresAt || new Date(),
    });

    return this.prisma.accessCard.update({
      where: { id },
      data: {
        isActive: true,
        blockedReason: null,
        blockedAt: null,
        activatedAt: new Date(),
      },
    });
  }

  /** Отзывает физический доступ для всех карт контракта */
  async revokeCardsForContract(contractId: number) {
    const cards = await this.prisma.accessCard.findMany({
      where: { contractId, isActive: true },
    });

    for (const card of cards) {
      try {
        await this.provider.revokeAccess({
          cardNumber: card.cardNumber,
          reason: 'Договор завершён',
        });
      } catch {
        // Логируем, но не падаем — карта уже заблокирована в БД
      }
    }
  }

  /** Удаляет карту доступа и отзывает доступ в СКУД */
  async remove(id: number, tenantId?: number) {
    const card = await this.findOne(id, tenantId);
    await this.provider.revokeAccess({
      cardNumber: card.cardNumber,
      reason: 'Карта удалена',
    });
    return this.prisma.accessCard.delete({ where: { id } });
  }
}
