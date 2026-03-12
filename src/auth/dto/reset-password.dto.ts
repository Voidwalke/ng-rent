import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'a1b2c3d4-reset-token' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'newSecure456!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
