import { Test, TestingModule } from '@nestjs/testing';
import { TenantPortalService } from './tenant-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../mailer/mailer.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TenantPortalService', () => {
  let service: TenantPortalService;

  const mockPrisma: any = {
    client: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    application: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    contract: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    unit: {
      findFirst: jest.fn(),
    },
    accessCard: {
      findMany: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
    maintenanceRequest: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockPayments = {
    createPayment: jest.fn(),
  };

  const mockNotifications = {
    notifyManagers: jest.fn().mockResolvedValue([]),
  };

  const mockMailer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantPortalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentsService, useValue: mockPayments },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<TenantPortalService>(TenantPortalService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  getMyApplications                                                  */
  /* ------------------------------------------------------------------ */
  describe('getMyApplications', () => {
    it('should return applications for the user client', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
        userId: 1,
      });
      mockPrisma.application.findMany.mockResolvedValueOnce([
        { id: 1, status: 'submitted' },
      ]);

      const result = await service.getMyApplications(1, 1);
      expect(result).toHaveLength(1);
    });

    it('should return empty array if user has no client', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);

      const result = await service.getMyApplications(1, 1);
      expect(result).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  createApplication                                                  */
  /* ------------------------------------------------------------------ */
  describe('createApplication', () => {
    it('should create application for existing client', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
        userId: 1,
        companyName: 'ООО Тест',
        contactName: 'Иванов',
      });
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 10,
        unitNumber: '101',
        status: 'available',
        property: { name: 'БЦ Альфа' },
      });
      mockPrisma.application.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        unitId: 10,
        clientId: 5,
        status: 'submitted',
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const result = await service.createApplication(1, 1, {
        unitId: 10,
        desiredStart: '2026-04-01',
        desiredEnd: '2027-03-31',
      });

      expect(result.status).toBe('submitted');
      expect(result.unitId).toBe(10);
    });

    it('should auto-create client if not linked to user', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        fullName: 'Иванов И.И.',
        email: 'ivanov@test.com',
        phone: '+79991234567',
      });
      mockPrisma.client.create.mockResolvedValueOnce({
        id: 10,
        tenantId: 1,
        userId: 1,
        companyName: 'Иванов И.И.',
        contactName: 'Иванов И.И.',
      });
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 5,
        status: 'available',
        property: { name: 'БЦ Тест' },
      });
      mockPrisma.application.create.mockResolvedValueOnce({
        id: 1,
        status: 'submitted',
        clientId: 10,
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const result = await service.createApplication(1, 1, {
        unitId: 5,
        desiredStart: '2026-04-01',
        desiredEnd: '2027-03-31',
      });

      expect(mockPrisma.client.create).toHaveBeenCalled();
      expect(result.clientId).toBe(10);
    });

    it('should throw BadRequestException if unit is unavailable', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.unit.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createApplication(1, 1, {
          unitId: 99,
          desiredStart: '2026-04-01',
          desiredEnd: '2027-03-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getApplication                                                     */
  /* ------------------------------------------------------------------ */
  describe('getApplication', () => {
    it('should return application for the user', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.application.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'submitted',
      });

      const result = await service.getApplication(1, 1, 1);
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException if no client linked', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      await expect(service.getApplication(1, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if application not found', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.application.findFirst.mockResolvedValueOnce(null);

      await expect(service.getApplication(1, 1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getMyContracts                                                     */
  /* ------------------------------------------------------------------ */
  describe('getMyContracts', () => {
    it('should return contracts for the user client', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { id: 1, contractNumber: 'D-001' },
      ]);

      const result = await service.getMyContracts(1, 1);
      expect(result).toHaveLength(1);
    });

    it('should return empty array if no client linked', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);

      const result = await service.getMyContracts(1, 1);
      expect(result).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  acceptContract                                                     */
  /* ------------------------------------------------------------------ */
  describe('acceptContract', () => {
    it('should accept a draft contract', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        clientId: 5,
        status: 'draft',
      });
      mockPrisma.contract.update.mockResolvedValueOnce({
        id: 1,
        edoStatus: 'signed',
        signedAt: new Date(),
      });

      const result = await service.acceptContract(1, 1, 1);
      expect(result.edoStatus).toBe('signed');
    });

    it('should accept a sent contract', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        clientId: 5,
        status: 'sent',
      });
      mockPrisma.contract.update.mockResolvedValueOnce({
        id: 1,
        edoStatus: 'signed',
      });

      const result = await service.acceptContract(1, 1, 1);
      expect(result.edoStatus).toBe('signed');
    });

    it('should throw BadRequestException for active contract', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        clientId: 5,
        status: 'active',
      });

      await expect(service.acceptContract(1, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if contract does not belong to client', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);

      await expect(service.acceptContract(1, 1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  getProfile / updateProfile                                         */
  /* ------------------------------------------------------------------ */
  describe('getProfile', () => {
    it('should return user profile with company info', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'user@test.com',
        fullName: 'Иванов',
        role: 'client',
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        companyName: 'ООО Тест',
        inn: '1234567890',
        contactPhone: '+79991234567',
      });

      const result = await service.getProfile(1, 1);
      expect(result.user.email).toBe('user@test.com');
      expect(result.company).not.toBeNull();
      expect(result.company!.companyName).toBe('ООО Тест');
    });

    it('should return null company if user has no linked client', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'user@test.com',
        fullName: 'Иванов',
        role: 'client',
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce(null);

      const result = await service.getProfile(1, 1);
      expect(result.company).toBeNull();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.getProfile(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  payInvoice                                                         */
  /* ------------------------------------------------------------------ */
  describe('payInvoice', () => {
    it('should delegate payment to PaymentsService', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.invoice.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'pending',
      });
      mockPayments.createPayment.mockResolvedValueOnce({
        paymentId: 1,
        confirmationUrl: 'https://pay.example.com',
      });

      const result = await service.payInvoice(1, 1, 1);
      expect(result.confirmationUrl).toBeDefined();
      expect(mockPayments.createPayment).toHaveBeenCalledWith(1, 1);
    });

    it('should throw NotFoundException if invoice not found for client', async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 5,
        tenantId: 1,
      });
      mockPrisma.invoice.findFirst.mockResolvedValueOnce(null);

      await expect(service.payInvoice(1, 1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
