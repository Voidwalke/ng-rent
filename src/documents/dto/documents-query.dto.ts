import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DocumentsQueryDto {
  @ApiProperty({ required: false, example: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiProperty({ required: false, example: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiProperty({ required: false, example: 'contract' })
  @IsOptional()
  @IsString()
  category?: string;
}
