import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ContractsService', () => {
  let service: ContractsService;

  const mockPrisma: any = {
    contract: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenant: { findUnique: jest.fn() },
    unit: { update: jest.fn(), updateMany: jest.fn() },
    invoice: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    accessCard: { updateMany: jest.fn(), create: jest.fn() },
    application: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockMailer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return paginated contract list', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { id: 1, contractNumber: 'C-001', status: 'active' },
      ]);
      mockPrisma.contract.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should cap limit at 100', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([]);
      mockPrisma.contract.count.mockResolvedValueOnce(0);

      await service.findAll(1, undefined, 1, 999);
      expect(mockPrisma.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return contract by id', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        contractNumber: 'C-001',
      });
      const result = await service.findOne(1);
      expect(result.contractNumber).toBe('C-001');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  generateFromApplication                                            */
  /* ------------------------------------------------------------------ */
  describe('generateFromApplication', () => {
    it('should create contract from approved application', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'approved',
        unitId: 10,
        clientId: 5,
        desiredStart: new Date('2026-04-01'),
        desiredEnd: new Date('2027-03-31'),
        desiredPrice: 80000,
        unit: { priceMonth: 90000 },
      };
      mockPrisma.application.findUnique.mockResolvedValueOnce(app);
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null); // no overlap
      mockPrisma.contract.count.mockResolvedValueOnce(0);
      mockPrisma.contract.create.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      mockPrisma.application.update.mockResolvedValueOnce({});

      const result = await service.generateFromApplication(1, 1);
      expect(result.monthlyRent).toBe(80000);
      expect(result.status).toBe('draft');
      expect(result.clientId).toBe(5);
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'contract_sent' },
        }),
      );
    });

    it('should use unit priceMonth when desiredPrice is null', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'approved',
        unitId: 10,
        clientId: 5,
        desiredStart: new Date('2026-04-01'),
        desiredEnd: new Date('2027-03-31'),
        desiredPrice: null,
        unit: { priceMonth: 90000 },
      };
      mockPrisma.application.findUnique.mockResolvedValueOnce(app);
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);
      mockPrisma.contract.count.mockResolvedValueOnce(0);
      mockPrisma.contract.create.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      mockPrisma.application.update.mockResolvedValueOnce({});

      const result = await service.generateFromApplication(1, 1);
      expect(result.monthlyRent).toBe(90000);
    });

    it('should throw BadRequestException if application is not approved', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'draft',
      });
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if application status is submitted (not approved)', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'submitted',
      });
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if application status is rejected', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'rejected',
      });
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if application belongs to different tenant', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 999,
        status: 'approved',
      });
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if application does not exist', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce(null);
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  sign                                                               */
  /* ------------------------------------------------------------------ */
  describe('sign', () => {
    const baseContract = {
      id: 1,
      tenantId: 1,
      unitId: 10,
      clientId: 5,
      applicationId: 1,
      contractNumber: 'D-202604-0001',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      monthlyRent: 100000,
      depositAmount: 100000,
      status: 'draft',
      client: { contactName: 'Ivanov I.I.', contactEmail: null },
      unit: { unitNumber: '101', property: { name: 'BC Alpha' } },
    };

    it('should sign a draft contract, create invoice, deposit and access card', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(baseContract);
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null); // no overlap
      mockPrisma.contract.update.mockResolvedValueOnce({
        ...baseContract,
        status: 'signed',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null });
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.accessCard.create.mockResolvedValueOnce({});

      const result = await service.sign(1, 1);
      expect(result.status).toBe('signed');

      expect(mockPrisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'rented' },
        }),
      );

      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'signed' },
        }),
      );

      // First invoice + deposit = 2 calls
      expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(2);

      // Check VAT on first invoice
      const firstInvoiceCall = mockPrisma.invoice.create.mock.calls[0][0];
      expect(Number(firstInvoiceCall.data.amount)).toBe(100000);
      expect(Number(firstInvoiceCall.data.vatAmount)).toBe(20000);
      expect(Number(firstInvoiceCall.data.totalAmount)).toBe(120000);

      expect(mockPrisma.accessCard.create).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException if contract is not in draft/sent status', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        status: 'active',
      });
      await expect(service.sign(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if contract is already signed', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        status: 'signed',
      });
      await expect(service.sign(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if contract is terminated', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        status: 'terminated',
      });
      await expect(service.sign(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should allow signing a contract with status sent', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        status: 'sent',
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null); // no overlap
      mockPrisma.contract.update.mockResolvedValueOnce({
        ...baseContract,
        status: 'signed',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null });
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.accessCard.create.mockResolvedValueOnce({});

      const result = await service.sign(1, 1);
      expect(result.status).toBe('signed');
    });

    it('should not create deposit invoice if depositAmount is 0', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        depositAmount: 0,
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);
      mockPrisma.contract.update.mockResolvedValueOnce({});
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ vatRate: null });
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.accessCard.create.mockResolvedValueOnce({});

      await service.sign(1, 1);
      expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  terminate                                                          */
  /* ------------------------------------------------------------------ */
  describe('terminate', () => {
    const activeContract = {
      id: 1,
      tenantId: 1,
      status: 'active',
      unitId: 10,
      clientId: 5,
      applicationId: 1,
      contractNumber: 'D-202601-0001',
      depositAmount: 50000,
    };

    it('should terminate an active contract and release the unit', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(activeContract);
      mockPrisma.contract.update.mockResolvedValueOnce({
        status: 'terminated',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);

      const result = await service.terminate(1, 'By mutual agreement');
      expect(result.message).toBe('Договор расторгнут');

      expect(mockPrisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'available' },
        }),
      );

      expect(mockPrisma.accessCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            blockedReason: 'Договор расторгнут',
          }),
        }),
      );
    });

    it('should throw BadRequestException if contract is not active or signed', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...activeContract,
        status: 'draft',
      });
      await expect(service.terminate(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if contract is expired', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...activeContract,
        status: 'expired',
      });
      await expect(service.terminate(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if contract is already terminated', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...activeContract,
        status: 'terminated',
      });
      await expect(service.terminate(1)).rejects.toThrow(BadRequestException);
    });

    it('should allow terminating a signed contract', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...activeContract,
        status: 'signed',
      });
      mockPrisma.contract.update.mockResolvedValueOnce({
        status: 'terminated',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);

      const result = await service.terminate(1, 'Early termination');
      expect(result.message).toBe('Договор расторгнут');
    });

    it('should create credit notes for paid future invoices', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(activeContract);
      mockPrisma.contract.update.mockResolvedValueOnce({});
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        {
          id: 10,
          invoiceNumber: 'INV-001',
          amount: 100000,
          vatAmount: 20000,
          totalAmount: 120000,
          periodStart: new Date('2027-01-01'),
          periodEnd: new Date('2027-01-31'),
        },
      ]);
      mockPrisma.invoice.count.mockResolvedValueOnce(5);
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);

      await service.terminate(1, 'Termination');

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: -100000,
            vatAmount: -20000,
            totalAmount: -120000,
            status: 'paid',
          }),
        }),
      );
    });

    it('should refund deposit if it was paid', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(activeContract);
      mockPrisma.contract.update.mockResolvedValueOnce({});
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 20,
        status: 'paid',
      });
      mockPrisma.invoice.count.mockResolvedValueOnce(3);
      mockPrisma.invoice.create.mockResolvedValue({});

      await service.terminate(1);

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: -50000,
            totalAmount: -50000,
            vatAmount: 0,
          }),
        }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  checkUnitOverlap (tested through generateFromApplication)          */
  /* ------------------------------------------------------------------ */
  describe('checkUnitOverlap (via generateFromApplication)', () => {
    it('should detect overlapping dates and throw BadRequestException', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'approved',
        unitId: 10,
        clientId: 5,
        desiredStart: new Date('2026-04-01'),
        desiredEnd: new Date('2027-03-31'),
        desiredPrice: 80000,
        unit: { priceMonth: 90000 },
      };
      mockPrisma.application.findUnique.mockResolvedValueOnce(app);

      // Overlap: existing contract on same unit with overlapping period
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 99,
        contractNumber: 'D-EXISTING-001',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-01-31'),
      });

      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not throw if no overlapping contract exists', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'approved',
        unitId: 10,
        clientId: 5,
        desiredStart: new Date('2026-04-01'),
        desiredEnd: new Date('2027-03-31'),
        desiredPrice: 80000,
        unit: { priceMonth: 90000 },
      };
      mockPrisma.application.findUnique.mockResolvedValueOnce(app);
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null); // no overlap
      mockPrisma.contract.count.mockResolvedValueOnce(0);
      mockPrisma.contract.create.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));
      mockPrisma.application.update.mockResolvedValueOnce({});

      const result = await service.generateFromApplication(1, 1);
      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
    });
  });

  /* ------------------------------------------------------------------ */
  /*  renew                                                              */
  /* ------------------------------------------------------------------ */
  describe('renew', () => {
    const signedContract = {
      id: 1,
      tenantId: 1,
      status: 'active',
      unitId: 10,
      clientId: 5,
      applicationId: 1,
      contractNumber: 'D-202601-0001',
      monthlyRent: 100000,
      endDate: new Date('2027-03-31'),
      client: { contactName: 'Ivanov' },
    };

    it('should renew a contract with new monthly rent', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(signedContract);
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null); // no overlap
      mockPrisma.contract.update.mockResolvedValueOnce({
        status: 'expired',
      });
      mockPrisma.contract.count.mockResolvedValueOnce(5);
      mockPrisma.contract.create.mockImplementation(({ data }: any) => ({
        id: 2,
        ...data,
      }));
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.accessCard.create.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});

      const result = await service.renew(1, 1, {
        newEndDate: '2028-03-31',
        newMonthlyRent: 110000,
      });

      expect(result.monthlyRent).toBe(110000);
      expect(result.status).toBe('signed');
      expect(mockPrisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'expired' },
        }),
      );
      expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.accessCard.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.accessCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });
});
