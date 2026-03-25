import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportTemplateQueryDto {
  @ApiProperty({
    example: 'units',
    enum: ['units', 'clients', 'contracts'],
    description: 'Тип импорта',
  })
  @IsString()
  type: string;
}
