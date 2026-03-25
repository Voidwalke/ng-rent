import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const mockPrisma: any = {
    invoice: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    contract: { findFirst: jest.fn() },
    accessCard: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pay', () => {
    const pendingInvoice = {
      id: 1,
      status: 'pending',
      totalAmount: 120000,
      paidAmount: 0,
      contractId: 10,
    };

    it('должен полностью оплатить счёт', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(pendingInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.pay(1);
      expect(result.status).toBe('paid');
      expect(result.paidAmount).toBe(120000);
      expect(result.paidAt).toBeInstanceOf(Date);
    });

    it('должен поддерживать частичную оплату', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(pendingInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.pay(1, 50000);
      expect(result.status).toBe('pending'); // не полностью оплачен
      expect(result.paidAmount).toBe(50000);
      expect(result.paidAt).toBeNull();
    });

    it('должен накапливать частичные оплаты до полной', async () => {
      const partiallyPaid = {
        ...pendingInvoice,
        paidAmount: 70000, // уже оплачено 70к из 120к
      };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(partiallyPaid);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.pay(1, 50000); // +50к = 120к
      expect(result.status).toBe('paid');
      expect(result.paidAmount).toBe(120000);
    });

    it('должен отклонить переплату', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(pendingInvoice);
      await expect(service.pay(1, 999999)).rejects.toThrow(BadRequestException);
    });

    it('должен отклонить оплату уже оплаченного счёта', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        ...pendingInvoice,
        status: 'paid',
      });
      await expect(service.pay(1)).rejects.toThrow(BadRequestException);
    });

    it('должен отклонить оплату отменённого счёта', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        ...pendingInvoice,
        status: 'cancelled',
      });
      await expect(service.pay(1)).rejects.toThrow(BadRequestException);
    });

    it('должен разблокировать СКУД при оплате последнего просроченного счёта', async () => {
      const overdueInvoice = { ...pendingInvoice, status: 'overdue' };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(overdueInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      // Нет других просроченных счетов по контракту
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({ count: 2 });

      await service.pay(1);

      // СКУД разблокирован
      expect(mockPrisma.accessCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: true,
            blockedReason: null,
          }),
        }),
      );
    });

    it('не должен разблокировать СКУД если есть другие просроченные счета', async () => {
      const overdueInvoice = { ...pendingInvoice, status: 'overdue' };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(overdueInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      // Есть ещё 1 просроченный счёт
      mockPrisma.invoice.count.mockResolvedValueOnce(1);

      await service.pay(1);

      // СКУД НЕ разблокирован
      expect(mockPrisma.accessCard.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('должен отменить неоплаченный счёт', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'pending',
      });
      mockPrisma.invoice.update.mockResolvedValueOnce({
        id: 1,
        status: 'cancelled',
      });

      const result = await service.cancel(1);
      expect(result.status).toBe('cancelled');
    });

    it('не должен отменять оплаченный счёт', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'paid',
      });
      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('createCreditNote', () => {
    it('должен создать кредит-ноту с пропорциональным НДС', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        contractId: 10,
        amount: 100000,
        vatAmount: 20000,
        totalAmount: 120000,
      });
      mockPrisma.invoice.count.mockResolvedValueOnce(3);
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 99,
        ...data,
      }));

      const result = await service.createCreditNote(1, {
        invoiceId: 1,
        amount: 50000,
      });

      expect(result.amount).toBe(-50000);
      expect(result.vatAmount).toBe(-10000); // 50000 * 0.2
      expect(result.totalAmount).toBe(-60000);
      expect(result.status).toBe('paid');
    });

    it('должен отклонить возврат больше суммы счёта', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        totalAmount: 120000,
      });
      await expect(
        service.createCreditNote(1, { invoiceId: 1, amount: 999999 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
