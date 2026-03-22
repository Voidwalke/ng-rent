import { IsInt, IsNumber, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  contractId: number;

  @ApiProperty({ example: 85000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ example: '2026-03-01', required: false })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiProperty({ example: '2026-03-31', required: false })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiProperty({ example: 'Доплата за парковочные места', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
