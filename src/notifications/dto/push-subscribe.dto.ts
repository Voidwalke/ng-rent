import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PushKeysDto {
  @ApiProperty({ example: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XFkApAJxjFZkT2' })
  @IsString()
  p256dh: string;

  @ApiProperty({ example: 'tBHItJI5svbpC7_AlignQ' })
  @IsString()
  auth: string;
}

export class PushSubscribeDto {
  @ApiProperty({
    example: 'https://fcm.googleapis.com/fcm/send/eKqL...',
    description: 'Push endpoint URL',
  })
  @IsString()
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @ApiPropertyOptional({ example: 'Chrome 120, macOS' })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
