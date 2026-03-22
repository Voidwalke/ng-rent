import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateClientDto {
  @ApiProperty({ example: 'ООО Альфа Плюс', required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: '7701234567', required: false })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiProperty({ example: '770101001', required: false })
  @IsOptional()
  @IsString()
  kpp?: string;

  @ApiProperty({ example: 'г. Москва, ул. Центральная, 1', required: false })
  @IsOptional()
  @IsString()
  legalAddress?: string;

  @ApiProperty({ example: 'Сидоров Сергей Иванович', required: false })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ example: 'sidorov@alfa.ru', required: false })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ example: '+7 999 123 45 67', required: false })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({ example: '40702810123456789012', required: false })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiProperty({ example: '044525225', required: false })
  @IsOptional()
  @IsString()
  bik?: string;
}
