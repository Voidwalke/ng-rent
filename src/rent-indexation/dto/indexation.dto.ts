import {
  IsNumber,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IndexationPreviewDto {
  @ApiProperty({ example: 5.5, description: 'Процент индексации' })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  rate: number;
}

export class IndexationApplyDto {
  @ApiProperty({ example: 5.5, description: 'Процент индексации' })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  rate: number;

  @ApiProperty({
    example: [1, 2, 3],
    required: false,
    description: 'ID договоров (пусто = все активные)',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  contractIds?: number[];
}
