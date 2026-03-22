import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTemplateDto {
  @ApiProperty({ example: 'Обновлённый шаблон', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'warehouse', required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ example: '<h1>Обновлённый договор</h1>', required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
