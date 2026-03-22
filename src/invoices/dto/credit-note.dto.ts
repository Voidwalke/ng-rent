import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreditNoteDto {
  @ApiProperty({ example: 1, description: 'ID исходного счёта' })
  @IsInt()
  invoiceId: number;

  @ApiProperty({ example: 15000, description: 'Сумма возврата' })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'Перерасчёт за период простоя', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
