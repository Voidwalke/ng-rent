import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: number) {
    return this.prisma.contract.findMany({
      where: { tenantId },
      include: {
        application: {
          include: {
            client: { select: { companyName: true } },
            unit: { select: { floor: true, areaSqm: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        application: {
          include: { client: true, unit: { include: { property: true } } },
        },
        invoices: true,
        accessCards: true,
      },
    });
    if (!contract) throw new NotFoundException('Договор не найден');
    return contract;
  }

  // Генерация договора после одобрения заявки
  async generateFromApplication(applicationId: number, tenantId: number) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { unit: true },
    });
    if (!app) throw new NotFoundException('Заявка не найдена');

    const contractNumber = `D-${Date.now()}-${app.unitId}`;

    const contract = await this.prisma.contract.create({
      data: {
        tenantId,
        applicationId,
        contractNumber,
        startDate: app.desiredStart,
        endDate: app.desiredEnd,
        monthlyRent: app.unit.priceMonth,
        status: 'draft',
      },
    });

    // Обновляем статус заявки
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'contract_sent' },
    });

    return contract;
  }

  // Подписание договора — создаём первый счёт и карту СКУД
  async sign(id: number) {
    const contract = await this.findOne(id);

    const result = await this.prisma.$transaction(async (tx) => {
      // Обновляем статус договора
      const updated = await tx.contract.update({
        where: { id },
        data: { status: 'signed', signedAt: new Date() },
      });

      // Помещение -> арендовано
      await tx.unit.update({
        where: { id: contract.application.unitId },
        data: { status: 'rented' },
      });

      // Заявка -> подписана
      await tx.application.update({
        where: { id: contract.applicationId },
        data: { status: 'signed' },
      });

      // Первый счёт
      const dueDate = new Date(contract.startDate);
      dueDate.setDate(dueDate.getDate() + 5);

      await tx.invoice.create({
        data: {
          tenantId: contract.tenantId,
          contractId: id,
          invoiceNumber: `INV-${Date.now()}`,
          amount: contract.monthlyRent,
          dueDate,
        },
      });

      // Карта СКУД
      await tx.accessCard.create({
        data: {
          tenantId: contract.tenantId,
          clientId: contract.application.clientId,
          contractId: id,
          cardNumber: `CARD-${Date.now()}`,
          activatedAt: new Date(),
        },
      });

      return updated;
    });

    return result;
  }

  async terminate(id: number) {
    const contract = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: { status: 'terminated' },
      });

      // Освобождаем помещение
      await tx.unit.update({
        where: { id: contract.application.unitId },
        data: { status: 'available' },
      });

      // Блокируем СКУД
      await tx.accessCard.updateMany({
        where: { contractId: id },
        data: {
          isActive: false,
          blockedReason: 'Договор расторгнут',
          blockedAt: new Date(),
        },
      });
    });

    return { message: 'Договор расторгнут' };
  }
}
