import {
  IsInt,
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePortalApplicationDto {
  @ApiProperty({ example: 1, description: 'ID помещения' })
  @IsInt()
  unitId: number;

  @ApiProperty({ example: '2026-04-01', description: 'Желаемая дата начала' })
  @IsDateString()
  desiredStart: string;

  @ApiProperty({
    example: '2027-03-31',
    description: 'Желаемая дата окончания',
  })
  @IsDateString()
  desiredEnd: string;

  @ApiPropertyOptional({ example: 80000, description: 'Желаемая ставка' })
  @IsOptional()
  @IsNumber()
  desiredPrice?: number;

  @ApiPropertyOptional({ example: 'Интересует офис с видом на парк' })
  @IsOptional()
  @IsString()
  comment?: string;
}
