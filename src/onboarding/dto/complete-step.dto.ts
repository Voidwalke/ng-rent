import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteStepDto {
  @ApiProperty({
    example: 'first_property',
    enum: [
      'company_info',
      'first_property',
      'first_units',
      'invite_team',
      'publish',
      'setup_payment',
    ],
  })
  @IsIn([
    'company_info',
    'first_property',
    'first_units',
    'invite_team',
    'publish',
    'setup_payment',
  ])
  step: string;
}
