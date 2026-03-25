import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientWebhookDto {
  @ApiProperty({ example: '7707083893' })
  @IsString()
  inn: string;

  @ApiPropertyOptional({ example: 'ООО Ромашка' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: 'г. Москва, ул. Ленина, 1' })
  @IsOptional()
  @IsString()
  legalAddress?: string;

  @ApiPropertyOptional({ example: '40702810000000000001' })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional({ example: '044525225' })
  @IsOptional()
  @IsString()
  bik?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  tenantId?: number;
}
