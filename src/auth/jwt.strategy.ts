import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  userId: number;
  tenantId: number;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  // Payload из токена попадает в request.user
  validate(payload: JwtPayload) {
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
