import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BlockAccessCardDto {
  @ApiProperty({
    example: 'Просрочка оплаты более 3 дней',
    description: 'Причина блокировки',
  })
  @IsString()
  reason: string;
}
