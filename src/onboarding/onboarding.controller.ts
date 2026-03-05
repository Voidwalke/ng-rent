import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CurrentUser } from '../common/decorators';

@ApiTags('Онбординг')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'Текущий прогресс онбординга' })
  getProgress(@CurrentUser() user: any) {
    return this.onboardingService.getProgress(user.tenantId);
  }

  @Patch('complete-step')
  @ApiOperation({ summary: 'Отметить шаг как пройденный' })
  completeStep(@CurrentUser() user: any, @Body('step') step: string) {
    return this.onboardingService.completeStep(user.tenantId, step);
  }

  @Patch('skip')
  @ApiOperation({ summary: 'Пропустить онбординг' })
  skip(@CurrentUser() user: any) {
    return this.onboardingService.skip(user.tenantId);
  }
}
