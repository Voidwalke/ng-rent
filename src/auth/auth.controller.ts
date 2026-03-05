import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto';
import { Public } from '../common/decorators';

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

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Обновление access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }
}
