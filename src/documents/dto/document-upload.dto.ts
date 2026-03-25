import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class DocumentUploadDto {
  @ApiProperty({
    example: 'contract',
    enum: ['contract', 'property', 'unit', 'client', 'application'],
  })
  @IsIn(['contract', 'property', 'unit', 'client', 'application'])
  entityType: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  entityId: number;

  @ApiProperty({ required: false, example: 'contract' })
  @IsOptional()
  @IsString()
  category?: string;
}
