import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RentIndexationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Предварительный расчёт индексации для активных договоров */
  async preview(tenantId: number, rate: number) {
    if (rate <= -50 || rate > 100) {
      throw new BadRequestException('Ставка индексации должна быть от -50% до +100%');
    }

    const contracts = await this.prisma.contract.findMany({
      where: { tenantId, status: { in: ['signed', 'active'] } },
      include: {
        client: { select: { companyName: true } },
        unit: { select: { unitNumber: true } },
      },
    });

    const multiplier = 1 + rate / 100;

    return contracts.map((c) => ({
      contractId: c.id,
      contractNumber: c.contractNumber,
      client: c.client?.companyName,
      unit: c.unit?.unitNumber,
      currentRent: Number(c.monthlyRent),
      newRent: Math.round(Number(c.monthlyRent) * multiplier),
      difference: Math.round(Number(c.monthlyRent) * multiplier - Number(c.monthlyRent)),
    }));
  }

  /** Применить индексацию ко всем активным договорам */
  async apply(tenantId: number, rate: number, contractIds?: number[]) {
    if (rate <= -50 || rate > 100) {
      throw new BadRequestException('Ставка индексации должна быть от -50% до +100%');
    }

    const where: any = { tenantId, status: { in: ['signed', 'active'] } };
    if (contractIds?.length) where.id = { in: contractIds };

    const contracts = await this.prisma.contract.findMany({ where });
    const multiplier = 1 + rate / 100;

    let updated = 0;
    for (const c of contracts) {
      const newRent = Math.round(Number(c.monthlyRent) * multiplier);
      await this.prisma.contract.update({
        where: { id: c.id },
        data: { monthlyRent: newRent },
      });
      updated++;
    }

    return { updated, rate: `${rate}%` };
  }
}
