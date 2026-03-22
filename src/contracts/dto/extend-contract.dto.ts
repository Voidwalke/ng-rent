import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtendContractDto {
  @ApiProperty({ example: '2027-06-30', description: 'Новая дата окончания' })
  @IsDateString()
  newEndDate: string;
}
