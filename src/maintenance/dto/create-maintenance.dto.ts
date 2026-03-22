import { IsInt, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMaintenanceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  unitId: number;

  @ApiProperty({ example: 'Протечка трубы в санузле' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Обнаружена течь в стояке холодной воды, нужен сантехник' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'high', enum: ['low', 'medium', 'high'], required: false })
  @IsOptional()
  @IsString()
  priority?: string;
}
