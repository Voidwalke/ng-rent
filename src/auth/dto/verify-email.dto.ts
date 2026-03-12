import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'email-verify-token-xyz' })
  @IsString()
  token: string;
}
