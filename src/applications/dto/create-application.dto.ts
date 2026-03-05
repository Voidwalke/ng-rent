import { IsInt, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  unitId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  clientId: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  desiredStart: string;

  @ApiProperty({ example: '2027-03-31' })
  @IsDateString()
  desiredEnd: string;

  @ApiPropertyOptional({ example: 'Нужен 3й этаж с панорамным видом' })
  @IsOptional()
  @IsString()
  comment?: string;
}
