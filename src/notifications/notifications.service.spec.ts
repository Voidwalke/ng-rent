import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  const mockGateway = {
    sendToUser: jest.fn(),
    sendToTenant: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create notification and push via WebSocket', async () => {
      const data = {
        tenantId: 1,
        userId: 1,
        type: 'invoice_created' as const,
        title: 'Новый счёт',
        message: 'Счёт №123 создан',
        metadata: { invoiceId: 123 },
      };

      mockPrisma.notification.create.mockResolvedValueOnce({
        id: 1,
        ...data,
        createdAt: new Date(),
      });

      const result = await service.create(data);

      expect(result.id).toBe(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          tenantId: 1,
          userId: 1,
          type: 'invoice_created',
          title: 'Новый счёт',
          message: 'Счёт №123 создан',
          metadata: { invoiceId: 123 },
        },
      });
      expect(mockGateway.sendToUser).toHaveBeenCalledWith(
        1,
        'notification',
        expect.objectContaining({ id: 1, type: 'invoice_created' }),
      );
    });
  });

  describe('notifyManagers', () => {
    it('should send notification to all managers of a tenant', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);
      mockPrisma.notification.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: Math.random(), ...data, createdAt: new Date() }),
      );

      const result = await service.notifyManagers(
        1,
        'application_submitted',
        'Новая заявка',
        'Заявка от ООО Ромашка',
      );

      expect(result).toHaveLength(3);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          role: { in: ['admin', 'manager'] },
          deletedAt: null,
        },
        select: { id: true },
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValueOnce([
        { id: 1, title: 'Test' },
      ]);
      mockPrisma.notification.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by isRead', async () => {
      mockPrisma.notification.findMany.mockResolvedValueOnce([]);
      mockPrisma.notification.count.mockResolvedValueOnce(0);

      await service.findAll(1, { isRead: false });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, readAt: null },
        }),
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockPrisma.notification.findFirst.mockResolvedValueOnce({
        id: 1,
        userId: 1,
      });
      mockPrisma.notification.update.mockResolvedValueOnce({
        id: 1,
        readAt: new Date(),
      });

      const result = await service.markAsRead(1, 1);
      expect(result.readAt).toBeDefined();
    });

    it('should throw NotFoundException if notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValueOnce(null);

      await expect(service.markAsRead(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValueOnce({ count: 5 });

      const result = await service.markAllRead(1);
      expect(result.message).toContain('прочитаны');
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      mockPrisma.notification.count.mockResolvedValueOnce(7);

      const result = await service.getUnreadCount(1);
      expect(result.count).toBe(7);
    });
  });
});
