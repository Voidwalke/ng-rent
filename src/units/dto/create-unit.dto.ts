import {
  IsInt,
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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
  @Min(0.1)
  areaSqm: number;

  @ApiProperty({ example: 85000 })
  @IsNumber()
  @Min(0)
  priceMonth: number;

  @ApiProperty({ enum: UnitStatus, required: false })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiProperty({
    example: 'Угловой офис с панорамным остеклением',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
