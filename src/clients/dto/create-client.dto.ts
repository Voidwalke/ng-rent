import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({ example: 'ООО Альфа' })
  @IsString()
  companyName: string;

  @ApiProperty({ required: false, example: '7701234567' })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiProperty({ example: 'Сидоров Сергей' })
  @IsString()
  contactName: string;

  @ApiProperty({ example: 'sidorov@alfa.ru' })
  @IsEmail()
  contactEmail: string;

  @ApiProperty({ required: false, example: '+7 999 123 45 67' })
  @IsOptional()
  @IsString()
  contactPhone?: string;
}
