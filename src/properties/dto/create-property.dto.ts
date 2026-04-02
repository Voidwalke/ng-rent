import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PropertyType } from '@prisma/client';

export class CreatePropertyDto {
  @ApiProperty({ example: 'БЦ Аврора' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'г. Москва, ул. Ленина, 15' })
  @IsString()
  address: string;

  @ApiProperty({ enum: PropertyType })
  @IsEnum(PropertyType)
  type: PropertyType;

  @ApiProperty({ example: 5000.0 })
  @IsNumber()
  totalArea: number;

  @ApiProperty({
    example: 'Современный бизнес-центр класса А',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Москва', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  floorsCount?: number;

  @ApiProperty({ example: 2005, required: false })
  @IsOptional()
  @IsInt()
  @Min(1900)
  yearBuilt?: number;

  @ApiProperty({ example: 'https://example.com/photo.jpg', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
