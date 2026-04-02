import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('ApplicationsService', () => {
  let service: ApplicationsService;

  const mockPrisma: any = {
    application: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unit: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockMailer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotifications = {
    notifyManagers: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */
  describe('create', () => {
    const validDto = {
      unitId: 1,
      clientId: 1,
      desiredStart: '2026-06-01',
      desiredEnd: '2027-05-31',
      comment: 'Need parking',
    };

    it('should throw BadRequestException if end date is before start date', async () => {
      const dto = {
        ...validDto,
        desiredStart: '2027-01-01',
        desiredEnd: '2026-06-01', // end before start
      };

      await expect(service.create(1, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(1, dto)).rejects.toThrow(
        'Дата окончания должна быть позже даты начала',
      );
    });

    it('should throw BadRequestException if end date equals start date', async () => {
      const dto = {
        ...validDto,
        desiredStart: '2026-06-01',
        desiredEnd: '2026-06-01', // same date
      };

      await expect(service.create(1, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if unit is not available', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'rented', // not available
        deletedAt: null,
        property: { name: 'BC Alpha' },
      });

      await expect(service.create(1, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if unit does not exist', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce(null); // unit not found

      await expect(service.create(1, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if unit belongs to different tenant (findFirst returns null)', async () => {
      // findFirst with tenantId filter returns null because unit belongs to different tenant
      mockPrisma.unit.findFirst.mockResolvedValueOnce(null);

      await expect(service.create(1, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if client does not exist', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'available',
        deletedAt: null,
        property: { name: 'BC Alpha' },
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce(null); // client not found

      await expect(service.create(1, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create application successfully with valid data', async () => {
      const createdApp = {
        id: 1,
        tenantId: 1,
        unitId: 1,
        clientId: 1,
        desiredStart: new Date('2026-06-01'),
        desiredEnd: new Date('2027-05-31'),
        comment: 'Need parking',
        status: 'draft',
      };

      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'available',
        deletedAt: null,
        property: { name: 'BC Alpha' },
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        companyName: 'Test Corp',
        contactName: 'John Doe',
        deletedAt: null,
      });
      mockPrisma.application.create.mockResolvedValueOnce(createdApp);

      const result = await service.create(1, validDto);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.status).toBe('draft');
    });

    it('should call notifyManagers after successful creation', async () => {
      mockPrisma.unit.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'available',
        deletedAt: null,
        property: { name: 'BC Alpha' },
      });
      mockPrisma.client.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        companyName: 'Test Corp',
        contactName: 'John Doe',
        deletedAt: null,
      });
      mockPrisma.application.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'draft',
      });

      await service.create(1, validDto);

      expect(mockNotifications.notifyManagers).toHaveBeenCalledWith(
        1,
        'application_submitted',
        'Новая заявка на аренду',
        expect.any(String),
        expect.objectContaining({ applicationId: 1 }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  reject                                                             */
  /* ------------------------------------------------------------------ */
  describe('reject', () => {
    it('should save rejection reason', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'under_review',
        unitId: 10,
        client: { contactEmail: null },
        unit: { unitNumber: '101', property: { name: 'BC' } },
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);
      mockPrisma.application.update.mockImplementation(
        ({ data }: any) => ({
          id: 1,
          ...data,
        }),
      );

      const result = await service.reject(
        1,
        100,
        1,
        'Company credit score too low',
      );

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('Company credit score too low');
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rejected',
            rejectionReason: 'Company credit score too low',
            reviewedById: 100,
          }),
        }),
      );
    });

    it('should save null when no rejection reason is provided', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'under_review',
        unitId: 10,
        client: { contactEmail: null },
        unit: { unitNumber: '101', property: { name: 'BC' } },
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);
      mockPrisma.application.update.mockImplementation(
        ({ data }: any) => ({
          id: 1,
          ...data,
        }),
      );

      const result = await service.reject(1, 100, 1);

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBeNull();
    });

    it('should throw BadRequestException for invalid transition (from draft)', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'draft', // cannot go directly to rejected
        unitId: 10,
        client: { contactEmail: null },
        unit: { unitNumber: '101', property: { name: 'BC' } },
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);

      await expect(
        service.reject(1, 100, 1, 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should send rejection email if client has email', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'under_review',
        unitId: 10,
        client: { contactEmail: 'client@test.com' },
        unit: { unitNumber: '101', property: { name: 'BC Alpha' } },
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);
      mockPrisma.application.update.mockImplementation(
        ({ data }: any) => ({
          id: 1,
          ...data,
        }),
      );

      await service.reject(1, 100, 1, 'No space available');

      expect(mockMailer.send).toHaveBeenCalledWith(
        'client@test.com',
        expect.stringContaining('отклонена'),
        'application-rejected',
        expect.objectContaining({
          rejectionReason: 'No space available',
        }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return application by id', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'draft',
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);

      const result = await service.findOne(1, 1);
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  submit                                                             */
  /* ------------------------------------------------------------------ */
  describe('submit', () => {
    it('should submit a draft application', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'draft',
      });
      mockPrisma.application.update.mockResolvedValueOnce({
        id: 1,
        status: 'submitted',
      });

      const result = await service.submit(1, 1);
      expect(result.status).toBe('submitted');
    });

    it('should throw BadRequestException for invalid transition', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'approved', // cannot go back to submitted
      });

      await expect(service.submit(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  approve                                                            */
  /* ------------------------------------------------------------------ */
  describe('approve', () => {
    it('should approve an application and reserve the unit', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'under_review',
        unitId: 10,
        client: { contactEmail: null },
        unit: { unitNumber: '101', property: { name: 'BC' } },
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);
      mockPrisma.unit.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.application.update.mockResolvedValueOnce({
        id: 1,
        status: 'approved',
      });

      const result = await service.approve(1, 100, 1);
      expect(result.status).toBe('approved');
      expect(mockPrisma.unit.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10, status: 'available' },
          data: { status: 'reserved' },
        }),
      );
    });

    it('should throw BadRequestException if unit is already reserved', async () => {
      const app = {
        id: 1,
        tenantId: 1,
        status: 'under_review',
        unitId: 10,
        client: { contactEmail: null },
        unit: { unitNumber: '101', property: { name: 'BC' } },
      };
      mockPrisma.application.findFirst.mockResolvedValueOnce(app);
      mockPrisma.unit.updateMany.mockResolvedValueOnce({ count: 0 }); // unit not available

      await expect(service.approve(1, 100, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
