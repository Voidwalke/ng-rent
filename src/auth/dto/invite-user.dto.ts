import { IsEmail, IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({ example: 'user@company.ru' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Иванов Иван' })
  @IsString()
  fullName: string;

  @ApiProperty({ enum: ['admin', 'manager', 'tenant'] })
  @IsIn(['admin', 'manager', 'tenant'])
  role: 'admin' | 'manager' | 'tenant';
}
