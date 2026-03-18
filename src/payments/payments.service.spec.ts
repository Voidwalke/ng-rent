import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockPrisma = {
    invoice: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    payment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {};
      return map[key] || undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPayment', () => {
    it('должен создать платёж по счёту', async () => {
      mockPrisma.payment.findFirst.mockResolvedValueOnce(null); // idempotency check
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        totalAmount: 10000,
        paidAmount: 0,
        status: 'pending',
        invoiceNumber: 'INV-001',
        contract: { client: { contactEmail: 'test@test.com' } },
      });
      mockPrisma.payment.create.mockResolvedValueOnce({ id: 1 });

      const result = await service.createPayment(1, 1);
      expect(result).toHaveProperty('paymentId');
      expect(result).toHaveProperty('confirmationUrl');
    });

    it('должен отклонить оплаченный счёт', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'paid',
        totalAmount: 10000,
      });
      await expect(service.createPayment(1, 1)).rejects.toThrow(
        'Счёт уже оплачен',
      );
    });

    it('должен выбросить ошибку если счёт не найден', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);
      await expect(service.createPayment(1, 999)).rejects.toThrow(
        'Счёт не найден',
      );
    });
  });

  describe('handleWebhook', () => {
    it('должен обработать успешный платёж', async () => {
      // Dedup check — не найден обработанный
      mockPrisma.payment.findFirst.mockResolvedValueOnce(null);
      // Actual payment lookup
      mockPrisma.payment.findFirst.mockResolvedValueOnce({
        id: 1,
        invoiceId: 1,
        amount: 10000,
        externalId: 'ext_1',
      });
      mockPrisma.payment.update.mockResolvedValueOnce({});
      mockPrisma.invoice.findUnique.mockResolvedValueOnce({
        id: 1,
        paidAmount: 0,
        totalAmount: 10000,
      });
      mockPrisma.invoice.update.mockResolvedValueOnce({});

      const result = await service.handleWebhook(
        {
          event: 'payment.succeeded',
          object: { id: 'ext_1', payment_method: { type: 'card' } },
        },
        'sig',
      );
      expect(result.status).toBe('ok');
    });

    it('должен игнорировать неизвестный платёж', async () => {
      mockPrisma.payment.findFirst.mockResolvedValueOnce(null); // dedup
      mockPrisma.payment.findFirst.mockResolvedValueOnce(null); // actual
      const result = await service.handleWebhook(
        { event: 'payment.succeeded', object: { id: 'unknown' } },
        'sig',
      );
      expect(result.status).toBe('ignored');
    });
  });

  describe('findAll', () => {
    it('должен вернуть платежи с пагинацией', async () => {
      mockPrisma.payment.findMany.mockResolvedValueOnce([{ id: 1 }]);
      mockPrisma.payment.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });
  });
});
