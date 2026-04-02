import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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
    contract: { findFirst: jest.fn(), findMany: jest.fn() },
    tenant: { findUnique: jest.fn() },
    accessCard: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockMailer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  getVatRate (private — tested through createManual / generateBatch) */
  /* ------------------------------------------------------------------ */
  describe('getVatRate (via createManual)', () => {
    const baseContract = {
      id: 10,
      tenantId: 1,
      contractNumber: 'D-202604-0001',
      client: { contactEmail: null },
      unit: { unitNumber: '101', property: { name: 'BC Alpha' } },
    };

    it('should return 0.2 (20 %) by default when tenant has no vatRate', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(baseContract);
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null });
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.createManual(1, {
        contractId: 10,
        amount: 100000,
        dueDate: '2026-04-15',
      });

      // Default 20 % → vatAmount = 100000 * 0.2 = 20000
      expect(result.vatAmount).toBe(20000);
      expect(result.totalAmount).toBe(120000);
    });

    it('should use custom vatRate from tenant settings', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(baseContract);
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      // Tenant has vatRate stored as 10.00 (10 %)
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: 10 });
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.createManual(1, {
        contractId: 10,
        amount: 100000,
        dueDate: '2026-04-15',
      });

      // 10 % → vatAmount = 100000 * 0.1 = 10000
      expect(result.vatAmount).toBe(10000);
      expect(result.totalAmount).toBe(110000);
    });

    it('should handle vatRate = 0 (no VAT)', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(baseContract);
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: 0 });
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.createManual(1, {
        contractId: 10,
        amount: 100000,
        dueDate: '2026-04-15',
      });

      expect(result.vatAmount).toBe(0);
      expect(result.totalAmount).toBe(100000);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  pay                                                                */
  /* ------------------------------------------------------------------ */
  describe('pay', () => {
    const pendingInvoice = {
      id: 1,
      status: 'pending',
      totalAmount: 120000,
      paidAmount: 0,
      contractId: 10,
    };

    it('should fully pay an invoice', async () => {
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

    it('should support partial payment', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(pendingInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.pay(1, 50000);
      expect(result.status).toBe('pending');
      expect(result.paidAmount).toBe(50000);
      expect(result.paidAt).toBeNull();
    });

    it('should accumulate partial payments up to full amount', async () => {
      const partiallyPaid = {
        ...pendingInvoice,
        paidAmount: 70000,
      };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(partiallyPaid);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.pay(1, 50000);
      expect(result.status).toBe('paid');
      expect(result.paidAmount).toBe(120000);
    });

    it('should throw BadRequestException if invoice already paid', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        ...pendingInvoice,
        status: 'paid',
      });
      await expect(service.pay(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when paying cancelled invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        ...pendingInvoice,
        status: 'cancelled',
      });
      await expect(service.pay(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if amount exceeds remaining', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(pendingInvoice);
      await expect(service.pay(1, 999999)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if partial amount exceeds remaining after prior payments', async () => {
      const partiallyPaid = {
        ...pendingInvoice,
        paidAmount: 100000, // 100k already paid out of 120k, only 20k remaining
      };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(partiallyPaid);
      // Trying to pay 30k but only 20k remaining
      await expect(service.pay(1, 30000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should unblock access cards when last overdue invoice is paid', async () => {
      const overdueInvoice = { ...pendingInvoice, status: 'overdue' };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(overdueInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({ count: 2 });

      await service.pay(1);

      expect(mockPrisma.accessCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: true,
            blockedReason: null,
          }),
        }),
      );
    });

    it('should NOT unblock access cards if other overdue invoices remain', async () => {
      const overdueInvoice = { ...pendingInvoice, status: 'overdue' };
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(overdueInvoice);
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      mockPrisma.invoice.count.mockResolvedValueOnce(1);

      await service.pay(1);

      expect(mockPrisma.accessCard.updateMany).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  cancel                                                             */
  /* ------------------------------------------------------------------ */
  describe('cancel', () => {
    it('should cancel a pending invoice', async () => {
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

    it('should cancel an overdue invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'overdue',
      });
      mockPrisma.invoice.update.mockResolvedValueOnce({
        id: 1,
        status: 'cancelled',
      });

      const result = await service.cancel(1);
      expect(result.status).toBe('cancelled');
    });

    it('should throw BadRequestException if invoice is paid', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'paid',
      });
      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if invoice is already cancelled', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'cancelled',
      });
      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if invoice does not exist', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);
      await expect(service.cancel(999)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  generateBatch                                                      */
  /* ------------------------------------------------------------------ */
  describe('generateBatch', () => {
    it('should skip contracts that already have invoices for the current period', async () => {
      const contracts = [
        {
          id: 1,
          contractNumber: 'D-001',
          monthlyRent: 100000,
          tenantId: 1,
          status: 'active',
        },
        {
          id: 2,
          contractNumber: 'D-002',
          monthlyRent: 80000,
          tenantId: 1,
          status: 'active',
        },
      ];

      mockPrisma.contract.findMany.mockResolvedValueOnce(contracts);

      // Contract 1 already has an invoice for this period
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { contractId: 1 },
      ]);

      // vatRate from tenant
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null });

      // For contract 2 (the one that will be generated)
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 99,
        ...data,
      }));

      const result = await service.generateBatch(1, [1, 2]);

      expect(result.generated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.invoices).toHaveLength(1);
      // The generated invoice should be for contract 2
      expect(result.invoices[0].contractId).toBe(2);
    });

    it('should generate invoices with correct VAT for all eligible contracts', async () => {
      const contracts = [
        {
          id: 3,
          contractNumber: 'D-003',
          monthlyRent: 50000,
          tenantId: 1,
          status: 'signed',
        },
      ];

      mockPrisma.contract.findMany.mockResolvedValueOnce(contracts);
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]); // no existing
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null }); // default 20%
      mockPrisma.invoice.count.mockResolvedValueOnce(0);
      mockPrisma.invoice.create.mockImplementation(({ data }: any) => ({
        id: 100,
        ...data,
      }));

      const result = await service.generateBatch(1, [3]);

      expect(result.generated).toBe(1);
      expect(result.skipped).toBe(0);
      // 50000 * 0.2 = 10000 VAT
      expect(result.invoices[0].vatAmount).toBe(10000);
      expect(result.invoices[0].totalAmount).toBe(60000);
    });

    it('should skip all contracts when all already have invoices', async () => {
      const contracts = [
        {
          id: 1,
          contractNumber: 'D-001',
          monthlyRent: 100000,
          tenantId: 1,
          status: 'active',
        },
      ];

      mockPrisma.contract.findMany.mockResolvedValueOnce(contracts);
      mockPrisma.invoice.findMany.mockResolvedValueOnce([{ contractId: 1 }]);
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null });

      const result = await service.generateBatch(1, [1]);

      expect(result.generated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.invoices).toHaveLength(0);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  createCreditNote                                                   */
  /* ------------------------------------------------------------------ */
  describe('createCreditNote', () => {
    it('should create a credit note with proportional VAT', async () => {
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
      expect(result.vatAmount).toBe(-10000);
      expect(result.totalAmount).toBe(-60000);
      expect(result.status).toBe('paid');
    });

    it('should reject refund exceeding invoice total', async () => {
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
