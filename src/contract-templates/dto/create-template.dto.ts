import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Стандартный договор аренды офиса' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'office', required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ example: '<h1>Договор аренды №{{number}}</h1><p>Арендодатель: {{landlord}}</p>' })
  @IsString()
  content: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
