import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  InviteUserDto,
  ChangePasswordDto,
  VerifyOtpDto,
  AcceptInviteDto,
  VerifyEmailDto,
} from './dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  // ─── Регистрация ──────────────────────────────────────────

  async register(dto: RegisterDto) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) throw new ConflictException('Такой slug уже занят');

    const emailTaken = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailTaken) throw new ConflictException('Email уже зарегистрирован');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.companyName, slug: dto.slug, inn: dto.inn },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: 'admin',
          emailVerified: false,
          lastLoginAt: new Date(),
        },
      });

      return { tenant, user };
    });

    // Отправляем email verification
    await this.sendVerificationEmail(result.user.id, result.user.email);

    const tokens = await this.generateTokens({
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: result.user.role,
    });
    await this.saveSession(result.user.id, tokens.refreshToken, 'registration');

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        fullName: result.user.fullName,
      },
    };
  }

  // ─── Логин ────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.deletedAt)
      throw new UnauthorizedException('Неверный email или пароль');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Неверный email или пароль');

    // Проверяем блокировку тенанта
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });
    if (tenant && !tenant.isActive)
      throw new UnauthorizedException('Организация заблокирована');

    // 2FA включена — отправляем OTP
    if (user.is2faEnabled) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      await this.redis.set(`otp:${user.id}`, otpHash, 300); // 5 мин

      const tempToken = await this.jwt.signAsync(
        { userId: user.id, type: '2fa' },
        { expiresIn: '5m' },
      );

      // TODO: отправка OTP по email через MailerService
      this.logger.log(`OTP для ${user.email}: ${otp}`);

      return { requires2fa: true, tempToken };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    await this.saveSession(user.id, tokens.refreshToken, 'login');

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }

  // ─── 2FA ──────────────────────────────────────────────────

  async verify2fa(dto: VerifyOtpDto) {
    let payload: any;
    try {
      payload = this.jwt.verify(dto.tempToken, {
        secret: this.config.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Невалидный или просроченный токен');
    }
    if (payload.type !== '2fa')
      throw new UnauthorizedException('Неверный тип токена');

    const otpHash = await this.redis.get<string>(`otp:${payload.userId}`);
    const inputHash = crypto
      .createHash('sha256')
      .update(dto.code)
      .digest('hex');

    if (!otpHash || otpHash !== inputHash) {
      throw new BadRequestException('Неверный код');
    }

    await this.redis.del(`otp:${payload.userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) throw new UnauthorizedException();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    await this.saveSession(user.id, tokens.refreshToken, '2fa-login');

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }

  async send2faCode(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    await this.redis.set(`otp:${userId}`, otpHash, 300);

    this.logger.log(`OTP для ${user.email}: ${otp}`);
    return { message: 'Код отправлен на email' };
  }

  async enable2fa(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { is2faEnabled: true },
    });
    return { message: '2FA включена' };
  }

  async disable2fa(userId: number, code: string) {
    const otpHash = await this.redis.get<string>(`otp:${userId}`);
    const inputHash = crypto.createHash('sha256').update(code).digest('hex');
    if (!otpHash || otpHash !== inputHash) {
      throw new BadRequestException('Неверный код');
    }
    await this.redis.del(`otp:${userId}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { is2faEnabled: false },
    });
    return { message: '2FA отключена' };
  }

  // ─── Email verification ───────────────────────────────────

  async sendVerificationEmail(userId: number, email: string) {
    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(`email-verify:${token}`, userId, 604800); // 7 дней
    // TODO: отправка email через MailerService
    this.logger.log(`Email verification для ${email}: ${token}`);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const userId = await this.redis.get<number>(`email-verify:${dto.token}`);
    if (!userId)
      throw new BadRequestException('Невалидный или просроченный токен');

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    await this.redis.del(`email-verify:${dto.token}`);

    return { message: 'Email подтверждён' };
  }

  // ─── Logout / Refresh ─────────────────────────────────────

  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      await this.redis.del(`session:${userId}:${this.hashToken(refreshToken)}`);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Выход выполнен' };
  }

  async refresh(dto: RefreshDto) {
    try {
      const payload = this.jwt.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });

      // Проверяем сессию в Redis
      const sessionKey = `session:${payload.userId}:${this.hashToken(dto.refreshToken)}`;
      const session = await this.redis.get<any>(sessionKey);
      if (!session) {
        // Fallback на проверку в БД
        const user = await this.prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (!user || user.refreshToken !== dto.refreshToken) {
          throw new UnauthorizedException('Невалидный refresh token');
        }
      }

      // Ротация: удаляем старый, создаём новый
      await this.redis.del(sessionKey);

      const tokens = await this.generateTokens({
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
      });
      await this.saveSession(payload.userId, tokens.refreshToken, 'refresh');
      await this.prisma.user.update({
        where: { id: payload.userId },
        data: { refreshToken: tokens.refreshToken },
      });

      return tokens;
    } catch {
      throw new UnauthorizedException('Невалидный refresh token');
    }
  }

  // ─── Forgot / Reset password ──────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.deletedAt) {
      return { message: 'Если email существует, ссылка для сброса отправлена' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(`reset:${token}`, user.id, 3600); // 1 час

    this.logger.log(`Reset token для ${user.email}: ${token}`);
    return { message: 'Если email существует, ссылка для сброса отправлена' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.redis.get<number>(`reset:${dto.token}`);
    if (!userId)
      throw new BadRequestException('Невалидный или просроченный токен');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshToken: null },
    });

    // Удаляем токен и все сессии
    await this.redis.del(`reset:${dto.token}`);
    await this.redis.delByPattern(`session:${userId}:*`);

    return { message: 'Пароль успешно изменён' };
  }

  // ─── Change password ──────────────────────────────────────

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const valid = await bcrypt.compare(dto.currentPassword, user!.passwordHash);
    if (!valid) throw new BadRequestException('Неверный текущий пароль');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Пароль изменён' };
  }

  // ─── Invite / Accept invite ───────────────────────────────

  async inviteUser(tenantId: number, dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new ConflictException('Пользователь с таким email уже существует');

    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(
      `invite:${token}`,
      { tenantId, email: dto.email, role: dto.role, fullName: dto.fullName },
      259200,
    ); // 72 часа

    this.logger.log(`Invite для ${dto.email}: ${token}`);
    return { message: 'Приглашение отправлено', email: dto.email };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.redis.get<any>(`invite:${dto.token}`);
    if (!invite)
      throw new BadRequestException('Невалидное или просроченное приглашение');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        tenantId: invite.tenantId,
        email: invite.email,
        fullName: dto.fullName,
        role: invite.role,
        passwordHash,
        emailVerified: true,
      },
    });

    await this.redis.del(`invite:${dto.token}`);

    const tokens = await this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    await this.saveSession(user.id, tokens.refreshToken, 'invite-accept');

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }

  // ─── Сессии ───────────────────────────────────────────────

  async getSessions(userId: number) {
    const keys = await this.redis.get<any>(`session-list:${userId}`);
    return keys || [];
  }

  async revokeSession(userId: number, sessionId: string) {
    await this.redis.del(`session:${userId}:${sessionId}`);
    // Обновляем список сессий
    const sessions = await this.getSessions(userId);
    const updated = sessions.filter((s: any) => s.id !== sessionId);
    await this.redis.set(`session-list:${userId}`, updated, 604800);
    return { message: 'Сессия отозвана' };
  }

  async revokeAllSessions(userId: number, currentToken?: string) {
    await this.redis.delByPattern(`session:${userId}:*`);
    await this.redis.del(`session-list:${userId}`);

    // Если передан текущий токен — пересоздаём его сессию
    if (currentToken) {
      await this.saveSession(userId, currentToken, 'revoke-all');
    }
    return { message: 'Все сессии отозваны' };
  }

  // ─── Профиль ──────────────────────────────────────────────

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        emailVerified: true,
        is2faEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, slug: true, plan: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  // ─── Вспомогательные ─────────────────────────────────────

  private async generateTokens(payload: JwtPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
      }),
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_REFRESH_TTL', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveSession(
    userId: number,
    refreshToken: string,
    source: string,
  ) {
    const hash = this.hashToken(refreshToken);
    const sessionData = {
      id: hash,
      source,
      createdAt: new Date().toISOString(),
    };

    await this.redis.set(`session:${userId}:${hash}`, sessionData, 604800); // 7 дней

    // Список сессий для GET /sessions
    const sessions =
      (await this.redis.get<any[]>(`session-list:${userId}`)) || [];
    sessions.push(sessionData);
    // Оставляем только последние 10
    const trimmed = sessions.slice(-10);
    await this.redis.set(`session-list:${userId}`, trimmed, 604800);

    // Сохраняем в БД как fallback
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
  }
}
