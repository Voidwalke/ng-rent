import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Проверяем что slug не занят
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) {
      throw new ConflictException('Такой slug уже занят');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Создаём tenant + первого админа в одной транзакции
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
