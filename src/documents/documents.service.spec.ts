import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ClamavService } from '../common/services/clamav.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockPrisma = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string, def: any) => def),
  };

  const mockClamav = {
    scan: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ClamavService, useValue: mockClamav },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEntity', () => {
    it('должен вернуть документы по сущности', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: 1, fileName: 'doc.pdf', entityType: 'contract', entityId: 1 },
      ]);
      const result = await service.findByEntity(1, 'contract', 1);
      expect(result).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('должен вернуть документы с пагинацией', async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([{ id: 1 }]);
      mockPrisma.document.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('remove', () => {
    it('должен выбросить ошибку если документ не найден', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove(1, 999)).rejects.toThrow(
        'Документ не найден',
      );
    });
  });
});
