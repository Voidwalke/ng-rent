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
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  InviteUserDto,
  ChangePasswordDto,
} from './dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Регистрация организации с первым админом */
  async register(dto: RegisterDto) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) throw new ConflictException('Такой slug уже занят');

    const emailTaken = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailTaken) throw new ConflictException('Email уже зарегистрирован');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          slug: dto.slug,
          inn: dto.inn,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: 'admin',
          emailVerified: true,
          lastLoginAt: new Date(),
        },
      });

      return { tenant, user };
    });

    const tokens = await this.generateTokens({
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: result.user.role,
    });

    await this.saveRefreshToken(result.user.id, tokens.refreshToken);

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

  /** Вход в систему */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Обновляем время последнего входа
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    await this.saveRefreshToken(user.id, tokens.refreshToken);

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

  /** Выход — инвалидация refresh token */
  async logout(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Выход выполнен' };
  }

  /** Обновление токенов */
  async refresh(dto: RefreshDto) {
    try {
      const payload = this.jwt.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.refreshToken !== dto.refreshToken) {
        throw new UnauthorizedException('Невалидный refresh token');
      }

      const tokens = await this.generateTokens({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      });

      await this.saveRefreshToken(user.id, tokens.refreshToken);
      return tokens;
    } catch {
      throw new UnauthorizedException('Невалидный refresh token');
    }
  }

  /** Запрос на сброс пароля — генерируем токен */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Не раскрываем есть ли такой email
    if (!user || user.deletedAt) {
      return { message: 'Если email существует, ссылка для сброса отправлена' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Сохраняем хеш токена в twoFaSecret (переиспользуем поле)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFaSecret: `reset:${resetTokenHash}:${Date.now() + 3600000}` },
    });

    // TODO: отправка email через MailerService
    this.logger.log(`Reset token для ${user.email}: ${resetToken}`);

    return { message: 'Если email существует, ссылка для сброса отправлена' };
  }

  /** Сброс пароля по токену */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    // Ищем пользователя с таким токеном
    const users = await this.prisma.user.findMany({
      where: {
        twoFaSecret: { startsWith: `reset:${tokenHash}:` },
        deletedAt: null,
      },
    });

    if (!users.length) {
      throw new BadRequestException('Невалидный или просроченный токен');
    }

    const user = users[0];
    const parts = user.twoFaSecret!.split(':');
    const expiresAt = parseInt(parts[2], 10);

    if (Date.now() > expiresAt) {
      throw new BadRequestException('Токен просрочен');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        twoFaSecret: null,
        refreshToken: null, // инвалидируем все сессии
      },
    });

    return { message: 'Пароль успешно изменён' };
  }

  /** Смена пароля авторизованным пользователем */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const valid = await bcrypt.compare(dto.currentPassword, user!.passwordHash);
    if (!valid) {
      throw new BadRequestException('Неверный текущий пароль');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Пароль изменён' };
  }

  /** Приглашение пользователя в организацию */
  async inviteUser(tenantId: number, dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new ConflictException('Пользователь с таким email уже существует');

    // Временный пароль — пользователь сменит при первом входе
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash,
        emailVerified: false,
      },
    });

    // TODO: отправка email с временным паролем
    this.logger.log(
      `Invite для ${dto.email}, временный пароль: ${tempPassword}`,
    );

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
  }

  /** Профиль текущего пользователя */
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
        expiresIn: this.config.get('JWT_REFRESH_TTL', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: number, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: token },
    });
  }
}
