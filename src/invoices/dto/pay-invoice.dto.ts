import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PayInvoiceDto {
  @ApiPropertyOptional({ example: 60000, description: 'Сумма оплаты' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  paidAmount?: number;

  @ApiPropertyOptional({
    example: 'PAY-2026-03-001',
    description: 'Номер платёжного поручения',
  })
  @IsOptional()
  @IsString()
  paymentReference?: string;
}
