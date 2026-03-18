import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ContractsService', () => {
  let service: ContractsService;

  const mockPrisma = {
    contract: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    unit: { update: jest.fn() },
    invoice: { updateMany: jest.fn() },
    accessCard: { updateMany: jest.fn() },
    notification: { create: jest.fn() },
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
    it('должен вернуть список договоров', async () => {
      mockPrisma.contract.findMany.mockResolvedValueOnce([
        { id: 1, contractNumber: 'C-001', status: 'active' },
      ]);
      mockPrisma.contract.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
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

    it('должен выбросить ошибку если не найден', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow();
    });
  });

  describe('terminate', () => {
    it('должен расторгнуть договор', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        status: 'active',
        unitId: 1,
      });
      mockPrisma.contract.update.mockResolvedValueOnce({
        id: 1,
        status: 'terminated',
      });
      mockPrisma.unit.update.mockResolvedValueOnce({});
      mockPrisma.accessCard.updateMany.mockResolvedValueOnce({});

      const result = await service.terminate(1, 'По соглашению сторон');
      expect(result).toHaveProperty('message');
    });
  });
});
