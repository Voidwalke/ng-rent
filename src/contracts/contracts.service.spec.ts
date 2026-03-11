import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractGeneratorService } from './contract-generator.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../queue/queue.service';

describe('ContractsService', () => {
  let service: ContractsService;

  const mockPrisma = {
    contract: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    application: { update: jest.fn() },
    unit: { update: jest.fn() },
  };

  const mockGenerator = {
    generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
    generateHtml: jest.fn().mockReturnValue('<html>contract</html>'),
  };

  const mockDocuments = {
    uploadBuffer: jest
      .fn()
      .mockResolvedValue({ fileUrl: 'contracts/1/test.pdf' }),
  };

  const mockNotifications = {
    create: jest.fn(),
    notifyManagers: jest.fn(),
  };

  const mockQueue = {
    publish: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContractGeneratorService, useValue: mockGenerator },
        { provide: DocumentsService, useValue: mockDocuments },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: QueueService, useValue: mockQueue },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated contracts', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { id: 1, contractNumber: 'CTR-001' },
      ]);
      mockPrisma.contract.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, {});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([]);
      mockPrisma.contract.count.mockResolvedValueOnce(0);

      await service.findAll(1, { status: 'active' });

      expect(mockPrisma.contract.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 1, status: 'active' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a contract with relations', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        contractNumber: 'CTR-001',
        tenantId: 1,
        client: { companyName: 'ООО Тест' },
        unit: { property: { name: 'БЦ Москва' } },
      });

      const result = await service.findOne(1, 1);
      expect(result.contractNumber).toBe('CTR-001');
    });

    it('should throw NotFoundException when contract not found', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('terminate', () => {
    it('should terminate an active contract', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'active',
        unitId: 5,
        clientId: 3,
      });
      mockPrisma.contract.update.mockResolvedValueOnce({
        id: 1,
        status: 'terminated',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});

      const result = await service.terminate(1, 1, 'Окончание срока');

      expect(result.status).toBe('terminated');
      expect(mockPrisma.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'available' }),
        }),
      );
    });

    it('should throw BadRequestException for non-active contract', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'draft',
      });

      await expect(service.terminate(1, 1, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
