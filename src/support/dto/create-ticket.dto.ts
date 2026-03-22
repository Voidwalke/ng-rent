import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ example: 'Не работает кондиционер в офисе 305' })
  @IsString()
  subject: string;

  @ApiPropertyOptional({
    example: 'maintenance',
    description: 'Категория: general, billing, maintenance, access, other',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'medium',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @ApiProperty({ example: 'Кондиционер не включается с понедельника, температура в офисе 28 градусов' })
  @IsString()
  message: string;
}
