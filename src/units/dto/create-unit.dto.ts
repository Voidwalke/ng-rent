import { IsInt, IsNumber, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UnitStatus } from '@prisma/client';

export class CreateUnitDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  propertyId: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  floor: number;

  @ApiProperty({ example: 75.5 })
  @IsNumber()
  areaSqm: number;

  @ApiProperty({ example: 85000 })
  @IsNumber()
  priceMonth: number;

  @ApiProperty({ enum: UnitStatus, required: false })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
