import { IsOptional, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivityQueryDto {
  @ApiProperty({ required: false, example: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiProperty({ required: false, example: '30' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
