import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PropertiesService', () => {
  let service: PropertiesService;

  const mockPrisma = {
    property: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unit: { count: jest.fn(), aggregate: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('должен вернуть список объектов', async () => {
      mockPrisma.property.findMany.mockResolvedValueOnce([
        { id: 1, name: 'БЦ Тест', city: 'Москва' },
      ]);
      mockPrisma.property.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, {});
      expect(result).toHaveProperty('data');
    });
  });

  describe('findOne', () => {
    it('должен вернуть объект с помещениями', async () => {
      mockPrisma.property.findUnique.mockResolvedValueOnce({
        id: 1,
        name: 'БЦ Тест',
        units: [{ id: 1 }],
      });
      const result = await service.findOne(1);
      expect(result.name).toBe('БЦ Тест');
    });

    it('должен выбросить ошибку если не найден', async () => {
      mockPrisma.property.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('должен создать объект недвижимости', async () => {
      mockPrisma.property.create.mockResolvedValueOnce({
        id: 1,
        name: 'Новый БЦ',
        tenantId: 1,
      });
      const result = await service.create(1, {
        name: 'Новый БЦ',
        address: 'Москва',
        city: 'Москва',
        type: 'office',
        totalArea: 5000,
      } as any);
      expect(result.name).toBe('Новый БЦ');
    });
  });

  describe('publish / unpublish', () => {
    it('должен опубликовать объект', async () => {
      mockPrisma.property.update.mockResolvedValueOnce({
        id: 1,
        isPublished: true,
      });
      const result = await service.publish(1);
      expect(result.isPublished).toBe(true);
    });
  });
});
