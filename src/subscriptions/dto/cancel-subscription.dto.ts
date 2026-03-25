import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelSubscriptionDto {
  @ApiProperty({
    example: 'Переход к другому провайдеру',
    required: false,
    description: 'Причина отмены',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
