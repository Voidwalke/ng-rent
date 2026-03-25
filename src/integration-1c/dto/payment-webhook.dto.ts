import { IsString, IsNumber, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentWebhookDto {
  @ApiProperty({ example: 'INV-2024-0001' })
  @IsString()
  invoiceNumber: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  paidAmount: number;

  @ApiProperty({ example: '2024-01-15T10:00:00Z' })
  @IsDateString()
  paidAt: string;

  @ApiProperty({ example: 'PAY-123456' })
  @IsString()
  paymentReference: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  tenantId?: number;
}
