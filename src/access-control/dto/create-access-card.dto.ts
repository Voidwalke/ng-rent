import { IsInt, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccessCardDto {
  @ApiProperty({ example: 1, description: 'ID клиента' })
  @IsInt()
  clientId: number;

  @ApiProperty({ example: 1, description: 'ID договора' })
  @IsInt()
  contractId: number;

  @ApiProperty({ example: 'CARD-A1B2C3D4', description: 'Номер карты' })
  @IsString()
  cardNumber: string;

  @ApiPropertyOptional({
    example: 'Иванов Иван Иванович',
    description: 'ФИО держателя',
  })
  @IsOptional()
  @IsString()
  holderName?: string;

  @ApiPropertyOptional({
    example: ['office', 'parking', 'gym'],
    description: 'Зоны доступа',
  })
  @IsOptional()
  @IsArray()
  zones?: string[];
}
