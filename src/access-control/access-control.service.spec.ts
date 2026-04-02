import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import type { IAccessControlProvider } from './access-control.provider';

describe('AccessControlService', () => {
  let service: AccessControlService;

  const mockPrisma: any = {
    accessCard: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    contract: {
      findFirst: jest.fn(),
    },
  };

  const mockProvider: IAccessControlProvider = {
    grantAccess: jest.fn().mockResolvedValue(undefined),
    revokeAccess: jest.fn().mockResolvedValue(undefined),
    getCardStatus: jest.fn().mockResolvedValue('active'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'ACCESS_CONTROL_PROVIDER', useValue: mockProvider },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return paginated access cards', async () => {
      mockPrisma.accessCard.findMany.mockResolvedValueOnce([
        { id: 1, cardNumber: 'CARD-001', isActive: true },
      ]);
      mockPrisma.accessCard.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, { page: 1, limit: 50 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should cap limit at 100', async () => {
      mockPrisma.accessCard.findMany.mockResolvedValueOnce([]);
      mockPrisma.accessCard.count.mockResolvedValueOnce(0);

      await service.findAll(1, { limit: 999 });
      expect(mockPrisma.accessCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should filter by clientId and isActive', async () => {
      mockPrisma.accessCard.findMany.mockResolvedValueOnce([]);
      mockPrisma.accessCard.count.mockResolvedValueOnce(0);

      await service.findAll(1, { clientId: 5, isActive: true });
      const callArgs = mockPrisma.accessCard.findMany.mock.calls[0][0];
      expect(callArgs.where.clientId).toBe(5);
      expect(callArgs.where.isActive).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return access card by id', async () => {
      mockPrisma.accessCard.findFirst.mockResolvedValueOnce({
        id: 1,
        cardNumber: 'CARD-001',
        isActive: true,
      });

      const result = await service.findOne(1, 1);
      expect(result.cardNumber).toBe('CARD-001');
    });

    it('should throw NotFoundException if card not found', async () => {
      mockPrisma.accessCard.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */
  describe('create', () => {
    it('should create access card and call provider grantAccess', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        endDate: new Date('2027-03-31'),
      });
      mockPrisma.accessCard.create.mockResolvedValueOnce({
        id: 1,
        cardNumber: 'CARD-NEW',
        tenantId: 1,
        zones: ['entrance', 'parking'],
      });

      const result = await service.create(1, {
        clientId: 5,
        contractId: 1,
        cardNumber: 'CARD-NEW',
        holderName: 'Иванов И.И.',
        zones: ['entrance', 'parking'],
      });

      expect(result.cardNumber).toBe('CARD-NEW');
      expect(mockProvider.grantAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          cardNumber: 'CARD-NEW',
          zones: ['entrance', 'parking'],
        }),
      );
    });

    it('should use empty zones array when zones not provided', async () => {
      mockPrisma.contract.findFirst.mockResolvedValueOnce({
        id: 1,
        endDate: new Date('2027-03-31'),
      });
      mockPrisma.accessCard.create.mockResolvedValueOnce({
        id: 1,
        cardNumber: 'CARD-002',
        zones: [],
      });

      await service.create(1, {
        clientId: 5,
        contractId: 1,
        cardNumber: 'CARD-002',
      });

      expect(mockProvider.grantAccess).toHaveBeenCalledWith(
        expect.objectContaining({ zones: [] }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  block                                                              */
  /* ------------------------------------------------------------------ */
  describe('block', () => {
    it('should block access card and call provider revokeAccess', async () => {
      mockPrisma.accessCard.findFirst.mockResolvedValueOnce({
        id: 1,
        cardNumber: 'CARD-001',
        isActive: true,
      });
      mockPrisma.accessCard.update.mockResolvedValueOnce({
        id: 1,
        isActive: false,
        blockedReason: 'Просрочка оплаты',
      });

      const result = await service.block(1, 'Просрочка оплаты', 1);
      expect(result.isActive).toBe(false);
      expect(result.blockedReason).toBe('Просрочка оплаты');
      expect(mockProvider.revokeAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          cardNumber: 'CARD-001',
          reason: 'Просрочка оплаты',
        }),
      );
    });

    it('should throw NotFoundException if card not found', async () => {
      mockPrisma.accessCard.findFirst.mockResolvedValueOnce(null);
      await expect(service.block(999, 'Причина', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  unblock                                                            */
  /* ------------------------------------------------------------------ */
  describe('unblock', () => {
    it('should unblock access card and call provider grantAccess', async () => {
      mockPrisma.accessCard.findFirst.mockResolvedValueOnce({
        id: 1,
        cardNumber: 'CARD-001',
        isActive: false,
        zones: ['entrance'],
        expiresAt: new Date('2027-12-31'),
      });
      mockPrisma.accessCard.update.mockResolvedValueOnce({
        id: 1,
        isActive: true,
        blockedReason: null,
      });

      const result = await service.unblock(1, 1);
      expect(result.isActive).toBe(true);
      expect(result.blockedReason).toBeNull();
      expect(mockProvider.grantAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          cardNumber: 'CARD-001',
          zones: ['entrance'],
        }),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  revokeCardsForContract                                             */
  /* ------------------------------------------------------------------ */
  describe('revokeCardsForContract', () => {
    it('should revoke access for all active cards of a contract', async () => {
      mockPrisma.accessCard.findMany.mockResolvedValueOnce([
        { id: 1, cardNumber: 'CARD-001', isActive: true },
        { id: 2, cardNumber: 'CARD-002', isActive: true },
      ]);

      await service.revokeCardsForContract(10);

      expect(mockProvider.revokeAccess).toHaveBeenCalledTimes(2);
      expect(mockProvider.revokeAccess).toHaveBeenCalledWith(
        expect.objectContaining({ cardNumber: 'CARD-001' }),
      );
      expect(mockProvider.revokeAccess).toHaveBeenCalledWith(
        expect.objectContaining({ cardNumber: 'CARD-002' }),
      );
    });

    it('should not fail if provider throws for one card', async () => {
      mockPrisma.accessCard.findMany.mockResolvedValueOnce([
        { id: 1, cardNumber: 'CARD-ERR', isActive: true },
      ]);
      (mockProvider.revokeAccess as jest.Mock).mockRejectedValueOnce(
        new Error('Provider error'),
      );

      // Should not throw
      await expect(service.revokeCardsForContract(10)).resolves.toBeUndefined();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  remove                                                             */
  /* ------------------------------------------------------------------ */
  describe('remove', () => {
    it('should delete card and revoke access', async () => {
      mockPrisma.accessCard.findFirst.mockResolvedValueOnce({
        id: 1,
        cardNumber: 'CARD-001',
      });
      mockPrisma.accessCard.delete.mockResolvedValueOnce({ id: 1 });

      const result = await service.remove(1, 1);
      expect(result.id).toBe(1);
      expect(mockProvider.revokeAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          cardNumber: 'CARD-001',
          reason: 'Карта удалена',
        }),
      );
    });
  });
});
