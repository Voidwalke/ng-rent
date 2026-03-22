import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMessageDto {
  @ApiProperty({ example: 'Мастер приедет завтра в 10:00' })
  @IsString()
  message: string;
}
