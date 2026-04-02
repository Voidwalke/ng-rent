import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TenantsService', () => {
  let service: TenantsService;

  const mockPrisma: any = {
    tenant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return list of all tenants', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([
        { id: 1, name: 'Org A' },
        { id: 2, name: 'Org B' },
      ]);

      const result = await service.findAll();
      expect(result).toHaveLength(2);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return tenant by id', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        name: 'Org A',
        isActive: true,
      });

      const result = await service.findOne(1);
      expect(result.name).toBe('Org A');
    });

    it('should throw NotFoundException if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */
  describe('create', () => {
    it('should create a new tenant', async () => {
      const dto = { name: 'Новая Организация' };
      mockPrisma.tenant.create.mockResolvedValueOnce({
        id: 1,
        ...dto,
        isActive: true,
      });

      const result = await service.create(dto as any);
      expect(result.name).toBe('Новая Организация');
      expect(result.isActive).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  update                                                             */
  /* ------------------------------------------------------------------ */
  describe('update', () => {
    it('should update tenant data', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        name: 'Старое Имя',
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({
        id: 1,
        name: 'Новое Имя',
      });

      const result = await service.update(1, { name: 'Новое Имя' } as any);
      expect(result.name).toBe('Новое Имя');
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.update(999, { name: 'test' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  remove (deactivate)                                                */
  /* ------------------------------------------------------------------ */
  describe('remove', () => {
    it('should deactivate tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({
        id: 1,
        isActive: false,
      });

      const result = await service.remove(1);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  toggle                                                             */
  /* ------------------------------------------------------------------ */
  describe('toggle', () => {
    it('should toggle active tenant to inactive', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({
        id: 1,
        isActive: false,
      });

      const result = await service.toggle(1);
      expect(result.isActive).toBe(false);
    });

    it('should toggle inactive tenant to active', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: false,
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });

      const result = await service.toggle(1);
      expect(result.isActive).toBe(true);
    });
  });
});
