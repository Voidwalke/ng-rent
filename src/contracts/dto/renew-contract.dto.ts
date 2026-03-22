import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenewContractDto {
  @ApiProperty({ example: '2027-03-31', description: 'Новая дата окончания' })
  @IsDateString()
  newEndDate: string;

  @ApiProperty({
    example: 90000,
    description: 'Новая ежемесячная ставка',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  newMonthlyRent?: number;
}
