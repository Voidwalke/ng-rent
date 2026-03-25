import { IsOptional, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsMonthsQueryDto {
  @ApiProperty({
    required: false,
    example: '6',
    description: 'Количество месяцев',
  })
  @IsOptional()
  @IsNumberString()
  months?: string;
}
