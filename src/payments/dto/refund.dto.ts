import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefundDto {
  @ApiPropertyOptional({
    example: 5000,
    description: 'Сумма возврата (если не указана — полный возврат)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;
}
