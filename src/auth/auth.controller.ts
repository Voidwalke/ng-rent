import { Throttle } from '@nestjs/throttler';
import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
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
import { Public, CurrentUser, Roles } from '../common/decorators';

@ApiTags('Авторизация')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: 'Регистрация организации' })
  @ApiResponse({
    status: 201,
    description: 'Организация создана, возвращены токены',
  })
  @ApiResponse({ status: 409, description: 'Email или slug уже заняты' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Вход (при 2FA — вернёт tempToken)' })
  @ApiResponse({
    status: 200,
    description: 'Токены или requires2fa + tempToken',
  })
  @ApiResponse({ status: 401, description: 'Неверный email или пароль' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('2fa/verify')
  @ApiOperation({ summary: 'Подтверждение 2FA кода' })
  verify2fa(@Body() dto: VerifyOtpDto) {
    return this.authService.verify2fa(dto);
  }

  @Post('2fa/send')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отправить OTP на email' })
  send2fa(@CurrentUser() user: any) {
    return this.authService.send2faCode(user.id);
  }

  @Post('2fa/enable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Включить 2FA' })
  enable2fa(@CurrentUser() user: any) {
    return this.authService.enable2fa(user.id);
  }

  @Post('2fa/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отключить 2FA (требуется OTP)' })
  disable2fa(@CurrentUser() user: any, @Body('code') code: string) {
    return this.authService.disable2fa(user.id, code);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Выход из системы' })
  logout(
    @CurrentUser() user: any,
    @Body('refreshToken') refreshToken?: string,
  ) {
    return this.authService.logout(user.id, refreshToken);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Обновление токенов' })
  @ApiResponse({
    status: 200,
    description: 'Новая пара accessToken + refreshToken',
  })
  @ApiResponse({ status: 401, description: 'Refresh token отозван или истёк' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Запрос на сброс пароля' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Сброс пароля по токену' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('verify-email')
  @ApiOperation({ summary: 'Подтверждение email' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('accept-invite')
  @ApiOperation({ summary: 'Принять приглашение и создать аккаунт' })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Смена пароля' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('invite')
  @ApiBearerAuth()
  @Roles('admin')
  @ApiOperation({ summary: 'Приглашение пользователя' })
  invite(@CurrentUser() user: any, @Body() dto: InviteUserDto) {
    return this.authService.inviteUser(user.tenantId, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Профиль текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Данные пользователя' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Список активных сессий' })
  getSessions(@CurrentUser() user: any) {
    return this.authService.getSessions(user.id);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отозвать конкретную сессию' })
  revokeSession(@CurrentUser() user: any, @Param('id') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  @Delete('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отозвать все сессии кроме текущей' })
  revokeAllSessions(@CurrentUser() user: any) {
    return this.authService.revokeAllSessions(user.id);
  }
}
