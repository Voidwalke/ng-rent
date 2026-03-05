import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  InviteUserDto,
  ChangePasswordDto,
} from './dto';
import { Public, CurrentUser, Roles } from '../common/decorators';

@ApiTags('Авторизация')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Регистрация новой организации' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Вход в систему' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Выход из системы' })
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Обновление access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Public()
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

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Смена пароля' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('invite')
  @ApiBearerAuth()
  @Roles('admin')
  @ApiOperation({ summary: 'Приглашение пользователя в организацию' })
  invite(@CurrentUser() user: any, @Body() dto: InviteUserDto) {
    return this.authService.inviteUser(user.tenantId, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Профиль текущего пользователя' })
  getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }
}
