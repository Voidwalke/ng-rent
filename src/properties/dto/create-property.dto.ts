import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator';
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
}
