import { IsEmail, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({ example: 'user@company.ru' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Иванов Иван' })
  @IsString()
  fullName: string;

  @ApiProperty({ enum: ['admin', 'manager', 'viewer'] })
  @IsEnum(['admin', 'manager', 'viewer'])
  role: 'admin' | 'manager' | 'viewer';
}
