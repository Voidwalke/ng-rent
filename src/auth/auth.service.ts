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
import { MailerService } from '../mailer/mailer.service';

/** Время жизни OTP-кода (секунды) */
const OTP_TTL = 300;
/** Время жизни токена сброса пароля (секунды) */
const RESET_TOKEN_TTL = 3600;
/** Время жизни приглашения (секунды) */
const INVITE_TTL = 259200;
/** Время жизни сессии (секунды) */
const SESSION_TTL = 604800;
/** Время жизни подтверждения email (секунды) */
const EMAIL_VERIFY_TTL = 604800;
/** Максимум попыток OTP */
const MAX_OTP_ATTEMPTS = 5;
/** Максимум неудачных попыток входа до блокировки */
const MAX_LOGIN_ATTEMPTS = 5;
/** Время блокировки аккаунта (секунды) */
const LOGIN_LOCKOUT_TTL = 900;
/** Количество раундов bcrypt */
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
  ) {}

  /** Регистрирует нового тенанта и администратора */
  async register(dto: RegisterDto) {
    if (!dto.acceptTerms) {
      throw new BadRequestException('Необходимо принять условия использования');
    }

    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) throw new ConflictException('Такой slug уже занят');

    const emailTaken = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailTaken) throw new ConflictException('Email уже зарегистрирован');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

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

      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 14);

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'free',
          priceMonthly: 0,
          status: 'trialing',
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          trialEndsAt: trialEnd,
        },
      });

      return { tenant, user };
    });

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

  /** Аутентифицирует пользователя по email и паролю */
  async login(dto: LoginDto) {
    // Проверка блокировки аккаунта
    const lockKey = `login-lock:${dto.email}`;
    const locked = await this.redis.get<number>(lockKey);
    if (locked) {
      throw new UnauthorizedException(
        'Аккаунт временно заблокирован. Попробуйте через 15 минут',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.deletedAt) {
      await this.trackLoginAttempt(dto.email);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.trackLoginAttempt(dto.email);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Сброс счётчика при успешном входе
    await this.redis.del(`login-attempts:${dto.email}`);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });
    if (tenant && !tenant.isActive)
      throw new UnauthorizedException('Организация заблокирована');

    if (user.is2faEnabled) {
      const otp = crypto.randomInt(100000, 1000000).toString();
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      await this.redis.set(`otp:${user.id}`, otpHash, OTP_TTL);

      const tempToken = await this.jwt.signAsync(
        { userId: user.id, type: '2fa' },
        { expiresIn: '5m' },
      );

      await this.mailer.send(user.email, 'Код подтверждения', 'otp', {
        code: otp,
      });
      this.logger.debug(`OTP отправлен на ${user.email}`);

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

  /** Подтверждает вход по одноразовому коду 2FA */
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

    // Защита от брутфорса OTP
    const attemptsKey = `otp-attempts:${payload.userId}`;
    const attempts = (await this.redis.get<number>(attemptsKey)) || 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await this.redis.del(`otp:${payload.userId}`);
      throw new BadRequestException(
        'Превышено количество попыток. Запросите новый код',
      );
    }

    const otpHash = await this.redis.get<string>(`otp:${payload.userId}`);
    const inputHash = crypto
      .createHash('sha256')
      .update(dto.code)
      .digest('hex');

    if (!otpHash || otpHash !== inputHash) {
      await this.redis.set(attemptsKey, attempts + 1, OTP_TTL);
      throw new BadRequestException('Неверный код');
    }

    await this.redis.del(`otp:${payload.userId}`);
    await this.redis.del(attemptsKey);

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

  /** Отправляет код 2FA на email */
  async send2faCode(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    await this.redis.set(`otp:${userId}`, otpHash, OTP_TTL);

    await this.mailer.send(user.email, 'Код подтверждения', 'otp', {
      code: otp,
    });
    this.logger.debug(`OTP отправлен на ${user.email}`);
    return { message: 'Код отправлен на email' };
  }

  /** Включает двухфакторную аутентификацию */
  async enable2fa(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { is2faEnabled: true },
    });
    return { message: '2FA включена' };
  }

  /** Отключает двухфакторную аутентификацию */
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

  /** Отправляет письмо для подтверждения email */
  async sendVerificationEmail(userId: number, _email: string) {
    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(`email-verify:${token}`, userId, EMAIL_VERIFY_TTL);
    const frontendUrl = this.config.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const verifyUrl = `${frontendUrl}/auth/verify-email?token=${token}`;
    await this.mailer.send(_email, 'Подтверждение email', 'welcome', {
      userName: 'пользователь',
      tenantName: '',
      verifyUrl,
    });
    this.logger.debug(`Email verification отправлен на ${_email}`);
  }

  /** Подтверждает email по токену из письма */
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

  /** Завершает сессию пользователя */
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

  /** Обновляет пару access/refresh токенов */
  async refresh(dto: RefreshDto) {
    try {
      const payload = this.jwt.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get(
          'JWT_REFRESH_SECRET',
          this.config.get('JWT_SECRET'),
        ),
      });

      const sessionKey = `session:${payload.userId}:${this.hashToken(dto.refreshToken)}`;
      const session = await this.redis.get<any>(sessionKey);
      if (!session) {
        // Фоллбэк — проверка в БД
        const user = await this.prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (!user || user.refreshToken !== this.hashToken(dto.refreshToken)) {
          throw new UnauthorizedException('Невалидный refresh token');
        }
      }

      // Ротация токенов: удаляем старый, создаём новый
      await this.redis.del(sessionKey);

      const tokens = await this.generateTokens({
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
      });
      await this.saveSession(payload.userId, tokens.refreshToken, 'refresh');

      return tokens;
    } catch {
      throw new UnauthorizedException('Невалидный refresh token');
    }
  }

  /** Инициирует сброс пароля по email */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.deletedAt) {
      return { message: 'Если email существует, ссылка для сброса отправлена' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(`reset:${token}`, user.id, RESET_TOKEN_TTL);

    const frontendUrl = this.config.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;
    await this.mailer.send(user.email, 'Сброс пароля', 'reset-password', {
      resetUrl,
    });
    this.logger.debug(`Reset email отправлен на ${user.email}`);
    return { message: 'Если email существует, ссылка для сброса отправлена' };
  }

  /** Устанавливает новый пароль по токену сброса */
  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.redis.get<number>(`reset:${dto.token}`);
    if (!userId)
      throw new BadRequestException('Невалидный или просроченный токен');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshToken: null },
    });

    await this.redis.del(`reset:${dto.token}`);
    await this.redis.delByPattern(`session:${userId}:*`);

    return { message: 'Пароль успешно изменён' };
  }

  /** Меняет пароль авторизованного пользователя */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Пользователь не найден');
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Неверный текущий пароль');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Пароль изменён' };
  }

  /** Отправляет приглашение пользователю по email */
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
      INVITE_TTL,
    );

    const frontendUrl = this.config.get(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const inviteUrl = `${frontendUrl}/auth/accept-invite?token=${token}`;
    await this.mailer.send(dto.email, 'Приглашение в NG RENT', 'invite', {
      tenantName: tenant?.name || 'NG RENT',
      inviteUrl,
    });
    this.logger.debug(`Приглашение отправлено на ${dto.email}`);
    return { message: 'Приглашение отправлено', email: dto.email };
  }

  /** Принимает приглашение и создаёт пользователя */
  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.redis.get<any>(`invite:${dto.token}`);
    if (!invite)
      throw new BadRequestException('Невалидное или просроченное приглашение');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
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

  /** Возвращает список активных сессий пользователя */
  async getSessions(userId: number) {
    const keys = await this.redis.get<any>(`session-list:${userId}`);
    return keys || [];
  }

  /** Отзывает конкретную сессию */
  async revokeSession(userId: number, sessionId: string) {
    await this.redis.del(`session:${userId}:${sessionId}`);
    const sessions = await this.getSessions(userId);
    const updated = sessions.filter((s: any) => s.id !== sessionId);
    await this.redis.set(`session-list:${userId}`, updated, SESSION_TTL);
    return { message: 'Сессия отозвана' };
  }

  /** Отзывает все сессии пользователя */
  async revokeAllSessions(userId: number, currentToken?: string) {
    await this.redis.delByPattern(`session:${userId}:*`);
    await this.redis.del(`session-list:${userId}`);

    if (currentToken) {
      await this.saveSession(userId, currentToken, 'revoke-all');
    }
    return { message: 'Все сессии отозваны' };
  }

  /** Возвращает профиль пользователя */
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

  private async generateTokens(payload: JwtPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get(
          'JWT_REFRESH_SECRET',
          this.config.get('JWT_SECRET'),
        ),
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

    await this.redis.set(`session:${userId}:${hash}`, sessionData, SESSION_TTL);

    const sessions =
      (await this.redis.get<any[]>(`session-list:${userId}`)) || [];
    sessions.push(sessionData);
    const trimmed = sessions.slice(-10);
    await this.redis.set(`session-list:${userId}`, trimmed, SESSION_TTL);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: this.hashToken(refreshToken) },
    });
  }

  private async trackLoginAttempt(email: string) {
    const key = `login-attempts:${email}`;
    const attempts = ((await this.redis.get<number>(key)) || 0) + 1;
    await this.redis.set(key, attempts, LOGIN_LOCKOUT_TTL);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await this.redis.set(`login-lock:${email}`, 1, LOGIN_LOCKOUT_TTL);
      this.logger.warn(
        `Аккаунт ${email} заблокирован после ${attempts} неудачных попыток`,
      );
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
