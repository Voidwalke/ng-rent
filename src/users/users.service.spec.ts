import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('должен вернуть список пользователей', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 1, email: 'test@test.com', fullName: 'Тест' },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(1);

      const result = await service.findAll(1);
      expect(result).toHaveProperty('data');
    });
  });

  describe('findOne', () => {
    it('должен вернуть пользователя по id', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 1,
        email: 'test@test.com',
      });
      const result = await service.findOne(1, 1);
      expect(result.email).toBe('test@test.com');
    });
  });

  describe('remove', () => {
    it('должен выполнить мягкое удаление', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 1,
        deletedAt: new Date(),
      });
      const result = await service.remove(1, 1);
      expect(result.deletedAt).toBeDefined();
    });
  });
});
