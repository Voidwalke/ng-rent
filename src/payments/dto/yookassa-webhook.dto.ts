import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class YookassaWebhookDto {
  @ApiProperty({ example: 'payment.succeeded', description: 'Тип события' })
  @IsString()
  event: string;

  @ApiProperty({
    example: {
      id: '2b4b3f7a-a01e-11eb-a8a0-0242ac130003',
      status: 'succeeded',
      amount: { value: '60000.00', currency: 'RUB' },
      metadata: { invoiceId: '1' },
    },
    description: 'Объект платежа',
  })
  @IsObject()
  object: any;

  @ApiPropertyOptional({ example: 'notification' })
  @IsOptional()
  @IsString()
  type?: string;
}
