import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailerService } from '../mailer/mailer.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma: any = {
    tenant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    subscription: {
      create: jest.fn().mockResolvedValue({
        id: 1,
        plan: 'free',
        status: 'trialing',
        trialEndsAt: new Date(),
      }),
    },
    subscriptionInvoice: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockJwt = {
    signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
    verify: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultVal?: any) => {
      const map: Record<string, any> = {
        JWT_SECRET: 'test-secret',
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '7d',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
        FRONTEND_URL: 'http://localhost:5173',
      };
      return map[key] ?? defaultVal;
    }),
  };

  const mockRedis = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue([]),
    delByPattern: jest.fn().mockResolvedValue(undefined),
  };

  const mockMailer = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
    // Re-establish default mockRedis behavior after clearAllMocks
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(undefined);
    mockRedis.delByPattern.mockResolvedValue(undefined);
    mockMailer.send.mockResolvedValue(undefined);
    mockJwt.signAsync.mockResolvedValue('mock.jwt.token');
    mockPrisma.subscription.create.mockResolvedValue({
      id: 1,
      plan: 'free',
      status: 'trialing',
      trialEndsAt: new Date(),
    });
    mockPrisma.subscriptionInvoice.create.mockResolvedValue({ id: 1 });
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /*  register                                                           */
  /* ------------------------------------------------------------------ */
  describe('register', () => {
    const dto = {
      companyName: 'Test Company',
      slug: 'test-company',
      email: 'admin@test.com',
      password: 'SecurePass123!',
      fullName: 'Test Admin',
      inn: '1234567890',
      acceptTerms: true,
    };

    it('should create user with hashed password', async () => {
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

      // Verify tokens are returned
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(dto.email);
      expect(result.user.role).toBe('admin');

      // Verify user was created with a hashed password (not plaintext)
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe(dto.password);
      // Verify the hash is a valid bcrypt hash
      const isValidHash = await bcrypt.compare(
        dto.password,
        createCall.data.passwordHash,
      );
      expect(isValidHash).toBe(true);
    });

    it('should reject duplicate email', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null); // slug free
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 1 }); // email taken

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      // Verify the correct error message
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 1 });
      await expect(service.register(dto)).rejects.toThrow(
        'Email уже зарегистрирован',
      );
    });

    it('should throw ConflictException if slug is already taken', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: 1 });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);

      // Reset mock for the second assertion
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: 1 });
      await expect(service.register({ ...dto })).rejects.toThrow(
        'Такой slug уже занят',
      );
    });

    it('should throw BadRequestException if terms not accepted', async () => {
      await expect(
        service.register({ ...dto, acceptTerms: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create subscription with the chosen plan', async () => {
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

      const result = await service.register({ ...dto, plan: 'basic' });

      expect(result.subscription).toBeDefined();
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('should send verification email after registration', async () => {
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

      await service.register(dto);

      expect(mockMailer.send).toHaveBeenCalledWith(
        dto.email,
        'Подтверждение email',
        'welcome',
        expect.any(Object),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  login                                                              */
  /* ------------------------------------------------------------------ */
  describe('login', () => {
    const dto = { email: 'admin@test.com', password: 'SecurePass123!' };

    it('should return tokens for valid credentials', async () => {
      const hash = await bcrypt.hash(dto.password, 4);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: hash,
        role: 'admin',
        is2faEnabled: false,
        deletedAt: null,
        fullName: 'Admin',
      });
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect((result as any).user.email).toBe(dto.email);
    });

    it('should reject invalid password', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: await bcrypt.hash('different-pass', 4),
        role: 'admin',
        is2faEnabled: false,
        deletedAt: null,
      });

      await expect(service.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 4),
        role: 'admin',
        is2faEnabled: false,
        deletedAt: new Date(), // soft-deleted
      });

      await expect(service.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if account is locked due to failed attempts', async () => {
      // Simulate locked account
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key === `login-lock:${dto.email}`) return 1; // locked
        return null;
      });

      await expect(service.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(dto)).rejects.toThrow(
        'Аккаунт временно заблокирован',
      );
    });

    it('should track failed login attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );

      // Should have called redis.set to increment attempts
      expect(mockRedis.set).toHaveBeenCalledWith(
        `login-attempts:${dto.email}`,
        1,
        expect.any(Number),
      );
    });

    it('should clear login attempts on successful login', async () => {
      const hash = await bcrypt.hash(dto.password, 4);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: hash,
        role: 'admin',
        is2faEnabled: false,
        deletedAt: null,
        fullName: 'Admin',
      });
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      await service.login(dto);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `login-attempts:${dto.email}`,
      );
    });

    it('should return requires2fa when 2FA is enabled', async () => {
      const hash = await bcrypt.hash(dto.password, 4);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: hash,
        role: 'admin',
        is2faEnabled: true,
        deletedAt: null,
        fullName: 'Admin',
      });
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });

      const result = await service.login(dto);

      expect(result).toHaveProperty('requires2fa', true);
      expect(result).toHaveProperty('tempToken');
    });

    it('should throw UnauthorizedException if tenant is inactive', async () => {
      const hash = await bcrypt.hash(dto.password, 4);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        email: dto.email,
        passwordHash: hash,
        role: 'admin',
        is2faEnabled: false,
        deletedAt: null,
        fullName: 'Admin',
      });
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: false, // organization blocked
      });

      await expect(service.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  changePassword                                                     */
  /* ------------------------------------------------------------------ */
  describe('changePassword', () => {
    it('should update password when current password is correct', async () => {
      const currentPass = 'OldPass123!';
      const newPass = 'NewPass456!';
      const hash = await bcrypt.hash(currentPass, 4);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        passwordHash: hash,
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.changePassword(1, {
        currentPassword: currentPass,
        newPassword: newPass,
      });

      expect(result.message).toBe('Пароль изменён');
      // Verify the update was called with a new hash
      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 1 });
      expect(updateCall.data.passwordHash).toBeDefined();
      expect(updateCall.data.passwordHash).not.toBe(newPass);
      // Verify the new hash validates against the new password
      const isValidNewHash = await bcrypt.compare(
        newPass,
        updateCall.data.passwordHash,
      );
      expect(isValidNewHash).toBe(true);
    });

    it('should throw BadRequestException when current password is wrong', async () => {
      const hash = await bcrypt.hash('RealPassword123!', 4);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        passwordHash: hash,
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPass456!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.changePassword(1, {
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass456!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  forgotPassword                                                     */
  /* ------------------------------------------------------------------ */
  describe('forgotPassword', () => {
    it('should generate reset token and store it in Redis', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'existing@test.com',
        deletedAt: null,
      });

      const result = await service.forgotPassword({
        email: 'existing@test.com',
      });

      expect(result.message).toBe(
        'Если email существует, ссылка для сброса отправлена',
      );
      // Verify redis.set was called with a reset token key
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^reset:/),
        1, // userId
        3600, // RESET_TOKEN_TTL
      );
      // Verify email was sent
      expect(mockMailer.send).toHaveBeenCalledWith(
        'existing@test.com',
        'Сброс пароля',
        'reset-password',
        expect.objectContaining({ resetUrl: expect.any(String) }),
      );
    });

    it('should return the same response whether or not the user exists (no information leak)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      const result1 = await service.forgotPassword({
        email: 'nonexistent@test.com',
      });

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'existing@test.com',
        deletedAt: null,
      });
      const result2 = await service.forgotPassword({
        email: 'existing@test.com',
      });

      expect(result1.message).toBe(result2.message);
    });

    it('should not send email if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await service.forgotPassword({ email: 'nonexistent@test.com' });

      expect(mockMailer.send).not.toHaveBeenCalled();
    });

    it('should not send email if user is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: 'deleted@test.com',
        deletedAt: new Date(),
      });

      await service.forgotPassword({ email: 'deleted@test.com' });

      expect(mockMailer.send).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  logout                                                             */
  /* ------------------------------------------------------------------ */
  describe('logout', () => {
    it('should clear refresh token', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.logout(1);
      expect(result.message).toBe('Выход выполнен');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { refreshToken: null },
        }),
      );
    });

    it('should delete redis session if refreshToken is provided', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});

      await service.logout(1, 'some-refresh-token');

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('session:1:'),
      );
    });
  });
});
