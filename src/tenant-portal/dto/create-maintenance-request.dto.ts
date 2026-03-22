import { IsInt, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMaintenanceRequestDto {
  @ApiProperty({ example: 1, description: 'ID помещения' })
  @IsInt()
  unitId: number;

  @ApiProperty({ example: 'Не работает кондиционер' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Кондиционер не включается с понедельника', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'medium', enum: ['low', 'medium', 'high'], required: false })
  @IsOptional()
  @IsString()
  priority?: string;
}
