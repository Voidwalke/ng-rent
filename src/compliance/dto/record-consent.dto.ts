import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordConsentDto {
  @ApiProperty({
    example: 'personal_data_processing',
    description: 'Тип согласия',
  })
  @IsString()
  type: string;
}
