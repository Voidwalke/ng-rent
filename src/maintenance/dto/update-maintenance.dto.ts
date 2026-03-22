import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsInt,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMaintenanceDto {
  @ApiProperty({
    example: 'in_progress',
    required: false,
    enum: ['open', 'in_progress', 'completed', 'cancelled'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    example: 'medium',
    required: false,
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiProperty({
    example: 5,
    required: false,
    description: 'ID ответственного сотрудника',
  })
  @IsOptional()
  @IsInt()
  assignedTo?: number;

  @ApiProperty({ example: 15000, required: false })
  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @ApiProperty({ example: 12500, required: false })
  @IsOptional()
  @IsNumber()
  actualCost?: number;

  @ApiProperty({ example: '2026-04-01T10:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
