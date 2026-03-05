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

  async findAll(
    tenantId: number,
    filters?: { clientId?: number; contractId?: number; isActive?: boolean },
  ) {
    const where: any = { tenantId };
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.contractId) where.contractId = filters.contractId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    return this.prisma.accessCard.findMany({
      where,
      include: {
        client: { select: { companyName: true } },
        contract: { select: { contractNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const card = await this.prisma.accessCard.findUnique({
      where: { id },
      include: { client: true, contract: true },
    });
    if (!card) throw new NotFoundException('Карта не найдена');
    return card;
  }

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
    const contract = await this.prisma.contract.findUnique({
      where: { id: data.contractId },
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

    // Команда в СКУД
    await this.provider.grantAccess({
      cardNumber: data.cardNumber,
      zones: data.zones || [],
      validFrom: new Date(),
      validTo: contract?.endDate || new Date(),
    });

    return card;
  }

  async block(id: number, reason: string) {
    const card = await this.findOne(id);

    await this.provider.revokeAccess({
      cardNumber: card.cardNumber,
      reason,
    });

    return this.prisma.accessCard.update({
      where: { id },
      data: { isActive: false, blockedReason: reason, blockedAt: new Date() },
    });
  }

  async unblock(id: number) {
    const card = await this.findOne(id);

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

  async remove(id: number) {
    const card = await this.findOne(id);
    await this.provider.revokeAccess({
      cardNumber: card.cardNumber,
      reason: 'Карта удалена',
    });
    return this.prisma.accessCard.delete({ where: { id } });
  }
}
