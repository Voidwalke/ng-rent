import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePlanDto {
  @ApiProperty({
    example: 'pro',
    description: 'Тарифный план',
    enum: ['free', 'basic', 'pro', 'enterprise'],
  })
  @IsIn(['free', 'basic', 'pro', 'enterprise'])
  plan: string;
}
