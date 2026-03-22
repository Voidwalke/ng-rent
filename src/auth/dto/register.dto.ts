import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
  IsBoolean,
} from 'class-validator';
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

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Минимум 8 символов, заглавная буква, цифра, спецсимвол',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-ZА-Я])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message: 'Пароль должен содержать заглавную букву, цифру и спецсимвол',
  })
  password: string;

  @ApiProperty({ example: 'Иванов Иван' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: '7712345678', required: false })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiProperty({
    example: true,
    description: 'Согласие с условиями использования',
  })
  @IsBoolean()
  acceptTerms: boolean;
}
