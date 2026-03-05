import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'manager@company.ru' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'pass123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Петров Пётр' })
  @IsString()
  fullName: string;

  @ApiProperty({ enum: UserRole, required: false })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
