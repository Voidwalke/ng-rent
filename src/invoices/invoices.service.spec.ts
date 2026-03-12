import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const mockPrisma = {
    invoice: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    accessCard: { updateMany: jest.fn() },
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

  describe('findAll', () => {
    it('должен вернуть счета с пагинацией', async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: 1, invoiceNumber: 'INV-001' },
      ]);
      mockPrisma.invoice.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('должен вернуть счёт по id', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        invoiceNumber: 'INV-001',
        tenantId: 1,
      });
      const result = await service.findOne(1, 1);
      expect(result.invoiceNumber).toBe('INV-001');
    });

    it('должен выбросить ошибку если не найден', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(1, 999)).rejects.toThrow();
    });
  });

  describe('confirmPayment', () => {
    it('должен подтвердить оплату счёта', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'pending',
        totalAmount: 10000,
      });
      mockPrisma.invoice.update.mockResolvedValueOnce({
        id: 1,
        status: 'paid',
        paidAt: new Date(),
      });

      const result = await service.confirmPayment(1, 1);
      expect(result.status).toBe('paid');
    });
  });
});
