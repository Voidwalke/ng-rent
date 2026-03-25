import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';
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
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('должен вернуть список договоров с пагинацией', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { id: 1, contractNumber: 'C-001', status: 'active' },
      ]);
      mockPrisma.contract.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('должен ограничивать limit до 100', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([]);
      mockPrisma.contract.count.mockResolvedValueOnce(0);

      await service.findAll(1, undefined, 1, 999);
      expect(mockPrisma.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('findOne', () => {
    it('должен вернуть договор по id', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        contractNumber: 'C-001',
      });
      const result = await service.findOne(1);
      expect(result.contractNumber).toBe('C-001');
    });

    it('должен выбросить NotFoundException если не найден', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateFromApplication', () => {
    it('должен создать договор по одобренной заявке', async () => {
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
      expect(result.monthlyRent).toBe(80000); // desiredPrice
      expect(result.status).toBe('draft');
      expect(result.clientId).toBe(5);
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'contract_sent' },
        }),
      );
    });

    it('должен использовать priceMonth если desiredPrice не указан', async () => {
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

    it('должен отклонить неодобренную заявку', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'draft',
      });
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен отклонить заявку другого тенанта', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 999,
        status: 'approved',
      });
      await expect(service.generateFromApplication(1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

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
      client: { contactName: 'Иванов И.И.' },
    };

    it('должен подписать договор, создать счёт, депозит и карту СКУД', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(baseContract);
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null); // no overlap
      mockPrisma.contract.update.mockResolvedValueOnce({
        ...baseContract,
        status: 'signed',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.accessCard.create.mockResolvedValueOnce({});

      const result = await service.sign(1, 1);
      expect(result.status).toBe('signed');

      // Помещение → rented
      expect(mockPrisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'rented' },
        }),
      );

      // Заявка → signed
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'signed' },
        }),
      );

      // Первый счёт с НДС + депозит = 2 вызова invoice.create
      expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(2);

      // Проверяем НДС на первом счёте
      const firstInvoiceCall = mockPrisma.invoice.create.mock.calls[0][0];
      expect(Number(firstInvoiceCall.data.amount)).toBe(100000);
      expect(Number(firstInvoiceCall.data.vatAmount)).toBe(20000);
      expect(Number(firstInvoiceCall.data.totalAmount)).toBe(120000);

      // Карта СКУД создана
      expect(mockPrisma.accessCard.create).toHaveBeenCalledTimes(1);
    });

    it('должен отклонить подписание договора не в статусе draft/sent', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        status: 'active',
      });
      await expect(service.sign(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('не должен создавать счёт на депозит если depositAmount = 0', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...baseContract,
        depositAmount: 0,
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);
      mockPrisma.contract.update.mockResolvedValueOnce({});
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.create.mockResolvedValue({});
      mockPrisma.accessCard.create.mockResolvedValueOnce({});

      await service.sign(1, 1);
      // Только 1 счёт (без депозита)
      expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
    });
  });

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

    it('должен расторгнуть договор и освободить помещение', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(activeContract);
      mockPrisma.contract.update.mockResolvedValueOnce({
        status: 'terminated',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null); // no paid deposit

      const result = await service.terminate(1, 'По соглашению сторон');
      expect(result.message).toBe('Договор расторгнут');

      // Помещение → available
      expect(mockPrisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'available' },
        }),
      );

      // СКУД заблокирован
      expect(mockPrisma.accessCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            blockedReason: 'Договор расторгнут',
          }),
        }),
      );

      // Заявка → terminated (не rejected)
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'terminated' },
        }),
      );
    });

    it('должен создать кредит-ноты для оплаченных будущих счетов', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(activeContract);
      mockPrisma.contract.update.mockResolvedValueOnce({});
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      // Оплаченный будущий счёт
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
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null); // no deposit

      await service.terminate(1, 'Расторжение');

      // Кредит-нота с отрицательными суммами
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

    it('должен вернуть депозит если он был оплачен', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(activeContract);
      mockPrisma.contract.update.mockResolvedValueOnce({});
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});
      mockPrisma.application.update.mockResolvedValueOnce({});
      mockPrisma.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]); // no future invoices
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 20,
        status: 'paid',
      }); // paid deposit
      mockPrisma.invoice.count.mockResolvedValueOnce(3);
      mockPrisma.invoice.create.mockResolvedValue({});

      await service.terminate(1);

      // Кредит-нота на возврат депозита
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

    it('не должен расторгать договор не в статусе active/signed', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        ...activeContract,
        status: 'draft',
      });
      await expect(service.terminate(1)).rejects.toThrow(BadRequestException);
    });
  });

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
      client: { contactName: 'Иванов' },
    };

    it('должен продлить договор с новой ставкой', async () => {
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
      // Старый договор → expired
      expect(mockPrisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'expired' },
        }),
      );
      // Первый счёт создан
      expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
      // Новая карта СКУД
      expect(mockPrisma.accessCard.create).toHaveBeenCalledTimes(1);
      // Старые карты заблокированы
      expect(mockPrisma.accessCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });
});
