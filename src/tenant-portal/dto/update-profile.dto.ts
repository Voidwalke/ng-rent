import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Сидоров Сергей Иванович', required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ example: '+7 999 123 45 67', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'ООО Альфа Плюс', required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: '7701234567', required: false })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiProperty({ example: 'г. Москва, ул. Центральная, 1', required: false })
  @IsOptional()
  @IsString()
  legalAddress?: string;
}
