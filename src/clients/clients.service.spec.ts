import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ClientsService', () => {
  let service: ClientsService;

  const mockPrisma: any = {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    contract: { count: jest.fn() },
    application: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    payment: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return paginated client list', async () => {
      mockPrisma.client.findMany.mockResolvedValueOnce([
        { id: 1, companyName: 'ООО Ромашка' },
      ]);
      mockPrisma.client.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should cap limit at 100', async () => {
      mockPrisma.client.findMany.mockResolvedValueOnce([]);
      mockPrisma.client.count.mockResolvedValueOnce(0);

      await service.findAll(1, { limit: 999 });
      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should apply search filter across companyName, inn, contactName', async () => {
      mockPrisma.client.findMany.mockResolvedValueOnce([]);
      mockPrisma.client.count.mockResolvedValueOnce(0);

      await service.findAll(1, { search: 'Ромашка' });

      const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(3);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return client by id', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        companyName: 'ООО Ромашка',
        tenantId: 1,
      });
      const result = await service.findOne(1, 1);
      expect(result.companyName).toBe('ООО Ромашка');
    });

    it('should throw NotFoundException if client not found', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */
  describe('create', () => {
    it('should create a new client', async () => {
      const dto = {
        companyName: 'ООО Тест',
        contactName: 'Иванов И.И.',
        contactEmail: 'test@example.com',
        contactPhone: '+79991234567',
      };
      mockPrisma.client.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        ...dto,
      });

      const result = await service.create(1, dto as any);
      expect(result.companyName).toBe('ООО Тест');
      expect(result.tenantId).toBe(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  update                                                             */
  /* ------------------------------------------------------------------ */
  describe('update', () => {
    it('should update client data', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        companyName: 'ООО Старое',
      });
      mockPrisma.client.update.mockResolvedValueOnce({
        id: 1,
        companyName: 'ООО Новое',
      });

      const result = await service.update(1, 1, { companyName: 'ООО Новое' });
      expect(result.companyName).toBe('ООО Новое');
    });

    it('should throw NotFoundException if client does not exist', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.update(999, 1, { companyName: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  softDelete                                                         */
  /* ------------------------------------------------------------------ */
  describe('softDelete', () => {
    it('should soft-delete client without active contracts', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
      });
      mockPrisma.contract.count.mockResolvedValueOnce(0);
      mockPrisma.client.update.mockResolvedValueOnce({});

      const result = await service.softDelete(1, 1);
      expect(result.message).toContain('удалён');
    });

    it('should throw BadRequestException if client has active contracts', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
      });
      mockPrisma.contract.count.mockResolvedValueOnce(3);

      await expect(service.softDelete(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if client not found', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      await expect(service.softDelete(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getHistory                                                         */
  /* ------------------------------------------------------------------ */
  describe('getHistory', () => {
    it('should return client history with applications, contracts, invoices and payments', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
      });
      mockPrisma.application.findMany.mockResolvedValueOnce([
        { id: 1, status: 'approved' },
      ]);
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { id: 1, contractNumber: 'D-001' },
      ]);
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: 1, invoiceNumber: 'INV-001' },
      ]);
      mockPrisma.payment.findMany.mockResolvedValueOnce([
        { id: 1, amount: 10000 },
      ]);

      const result = await service.getHistory(1, 1);
      expect(result.applications).toHaveLength(1);
      expect(result.contracts).toHaveLength(1);
      expect(result.invoices).toHaveLength(1);
      expect(result.payments).toHaveLength(1);
    });

    it('should throw NotFoundException if client does not exist', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      await expect(service.getHistory(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
