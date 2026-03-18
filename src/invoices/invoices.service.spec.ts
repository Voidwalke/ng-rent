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
      aggregate: jest.fn(),
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
    it('должен вернуть счета тенанта', async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: 1, invoiceNumber: 'INV-001' },
      ]);
      mockPrisma.invoice.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1);
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('должен вернуть счёт по id', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        invoiceNumber: 'INV-001',
      });
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
  });

  describe('pay', () => {
    it('должен подтвердить оплату счёта', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'pending',
        totalAmount: 10000,
      });
      mockPrisma.invoice.update.mockResolvedValueOnce({
        id: 1,
        status: 'paid',
      });

      const result = await service.pay(1);
      expect(result).toBeDefined();
    });
  });
});
