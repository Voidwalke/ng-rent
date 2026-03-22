import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'ООО Новая компания' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'new-company' })
  @IsString()
  slug: string;

  @ApiProperty({ example: '7703456789', required: false })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiProperty({ enum: TenantPlan, required: false })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}
