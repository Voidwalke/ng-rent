import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;
  let redis: RedisService;

  const mockPrisma = {
    tenant: { findUnique: jest.fn(), create: jest.fn() },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  const mockJwt = {
    signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
    verify: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultVal?: any) => {
      const map: Record<string, any> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '7d',
      };
      return map[key] ?? defaultVal;
    }),
  };

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwt = module.get<JwtService>(JwtService);
    redis = module.get<RedisService>(RedisService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const dto = {
      companyName: 'Test Company',
      slug: 'test-company',
      email: 'admin@test.com',
      password: 'SecurePass123!',
      fullName: 'Test Admin',
      inn: '1234567890',
    };

    it('should throw ConflictException if slug is taken', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: 1 });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if email is taken', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 1 });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('should create tenant and admin user on success', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.tenant.create.mockResolvedValueOnce({
        id: 1,
        name: dto.companyName,
        slug: dto.slug,
      });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        role: 'admin',
        fullName: dto.fullName,
      });

      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(dto.email);
      expect(result.user.role).toBe('admin');
    });

    it('should hash password with bcrypt salt 12', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.tenant.create.mockResolvedValueOnce({
        id: 1,
        name: dto.companyName,
        slug: dto.slug,
      });
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        role: 'admin',
        fullName: dto.fullName,
      });

      const hashSpy = jest.spyOn(bcrypt, 'hash');
      await service.register(dto);

      expect(hashSpy).toHaveBeenCalledWith(dto.password, 12);
    });
  });

  describe('login', () => {
    const dto = { email: 'admin@test.com', password: 'SecurePass123!' };

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: await bcrypt.hash('different-pass', 12),
        role: 'admin',
        is2faEnabled: false,
        deletedAt: null,
        tenant: { isActive: true },
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens on successful login without 2FA', async () => {
      const hash = await bcrypt.hash(dto.password, 12);
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: hash,
        role: 'admin',
        is2faEnabled: false,
        deletedAt: null,
        fullName: 'Admin',
        tenant: { isActive: true },
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should return requires2fa when 2FA is enabled', async () => {
      const hash = await bcrypt.hash(dto.password, 12);
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: hash,
        role: 'admin',
        is2faEnabled: true,
        deletedAt: null,
        fullName: 'Admin',
        tenant: { isActive: true },
      });

      const result = await service.login(dto);

      expect(result).toHaveProperty('requires2fa', true);
      expect(result).toHaveProperty('tempToken');
    });
  });
});
