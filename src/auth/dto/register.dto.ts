import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'ООО Ромашка' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: 'romashka' })
  @IsString()
  slug: string;

  @ApiProperty({ example: 'admin@romashka.ru' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePass123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Иванов Иван' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: '7712345678', required: false })
  @IsOptional()
  @IsString()
  inn?: string;
}
