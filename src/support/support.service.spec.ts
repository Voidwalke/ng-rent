import { Test, TestingModule } from '@nestjs/testing';
import { SupportService } from './support.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('SupportService', () => {
  let service: SupportService;

  const mockPrisma: any = {
    supportTicket: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    supportMessage: {
      create: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  createTicket                                                       */
  /* ------------------------------------------------------------------ */
  describe('createTicket', () => {
    it('should create a ticket with initial message', async () => {
      mockPrisma.supportTicket.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        userId: 1,
        subject: 'Проблема с оплатой',
        category: 'billing',
        priority: 'high',
      });
      mockPrisma.supportMessage.create.mockResolvedValueOnce({
        id: 1,
        ticketId: 1,
      });

      const result = await service.createTicket(1, 1, {
        subject: 'Проблема с оплатой',
        category: 'billing',
        priority: 'high',
        message: 'Не могу оплатить счёт',
      });

      expect(result.subject).toBe('Проблема с оплатой');
      expect(result.priority).toBe('high');
      expect(mockPrisma.supportMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 1,
            senderId: 1,
            senderType: 'user',
            message: 'Не могу оплатить счёт',
          }),
        }),
      );
    });

    it('should use default category and priority when not specified', async () => {
      mockPrisma.supportTicket.create.mockImplementation(
        ({ data }: any) => ({
          id: 1,
          ...data,
        }),
      );
      mockPrisma.supportMessage.create.mockResolvedValueOnce({});

      const result = await service.createTicket(1, 1, {
        subject: 'Вопрос',
        message: 'Общий вопрос',
      });

      expect(result.category).toBe('other');
      expect(result.priority).toBe('medium');
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findAll                                                            */
  /* ------------------------------------------------------------------ */
  describe('findAll', () => {
    it('should return paginated ticket list', async () => {
      mockPrisma.supportTicket.findMany.mockResolvedValueOnce([
        { id: 1, subject: 'Тикет 1' },
      ]);
      mockPrisma.supportTicket.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.pages).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrisma.supportTicket.findMany.mockResolvedValueOnce([]);
      mockPrisma.supportTicket.count.mockResolvedValueOnce(0);

      await service.findAll(1, { status: 'open' as any });
      const callArgs = mockPrisma.supportTicket.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('open');
    });
  });

  /* ------------------------------------------------------------------ */
  /*  findOne                                                            */
  /* ------------------------------------------------------------------ */
  describe('findOne', () => {
    it('should return ticket with messages', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        subject: 'Тикет 1',
        messages: [{ id: 1, message: 'Привет' }],
      });

      const result = await service.findOne(1, 1);
      expect(result.subject).toBe('Тикет 1');
      expect(result.messages).toHaveLength(1);
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  addMessage                                                         */
  /* ------------------------------------------------------------------ */
  describe('addMessage', () => {
    it('should add message to open ticket', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'open',
      });
      mockPrisma.supportMessage.create.mockResolvedValueOnce({
        id: 2,
        ticketId: 1,
        message: 'Дополнение',
      });

      const result = await service.addMessage(1, 1, 1, 'Дополнение');
      expect(result.message).toBe('Дополнение');
    });

    it('should throw BadRequestException if ticket is closed', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'closed',
      });

      await expect(service.addMessage(1, 1, 1, 'Текст')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reopen resolved ticket when new message is added', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'resolved',
      });
      mockPrisma.supportTicket.update.mockResolvedValueOnce({
        id: 1,
        status: 'open',
      });
      mockPrisma.supportMessage.create.mockResolvedValueOnce({
        id: 2,
        ticketId: 1,
      });

      await service.addMessage(1, 1, 1, 'Проблема не решена');

      expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'open', resolvedAt: null },
        }),
      );
    });

    it('should throw NotFoundException if ticket does not exist', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce(null);
      await expect(service.addMessage(1, 999, 1, 'Текст')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  resolve                                                            */
  /* ------------------------------------------------------------------ */
  describe('resolve', () => {
    it('should resolve an open ticket', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'open',
      });
      mockPrisma.supportTicket.update.mockResolvedValueOnce({
        id: 1,
        status: 'resolved',
        resolvedAt: new Date(),
      });

      const result = await service.resolve(1, 1);
      expect(result.status).toBe('resolved');
      expect(result.resolvedAt).toBeDefined();
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce(null);
      await expect(service.resolve(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  close                                                              */
  /* ------------------------------------------------------------------ */
  describe('close', () => {
    it('should close a ticket', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'open',
        resolvedAt: null,
      });
      mockPrisma.supportTicket.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.close(1, 1);
      expect(result.status).toBe('closed');
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });

    it('should keep existing resolvedAt when closing a resolved ticket', async () => {
      const resolvedAt = new Date('2026-01-15');
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: 'resolved',
        resolvedAt,
      });
      mockPrisma.supportTicket.update.mockImplementation(({ data }: any) => ({
        id: 1,
        ...data,
      }));

      const result = await service.close(1, 1);
      expect(result.status).toBe('closed');
      expect(result.resolvedAt).toEqual(resolvedAt);
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValueOnce(null);
      await expect(service.close(1, 999)).rejects.toThrow(NotFoundException);
    });
  });
});
