import { IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class YookassaWebhookDto {
  @ApiProperty({ example: 'notification', description: 'Тип уведомления' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'payment.succeeded', description: 'Тип события' })
  @IsString()
  event: string;

  @ApiProperty({
    example: {
      id: '2b4b3f7a-a01e-11eb-a8a0-0242ac130003',
      status: 'succeeded',
      amount: { value: '60000.00', currency: 'RUB' },
      payment_method: { type: 'bank_card', title: 'Bank card *1026' },
      metadata: { invoiceId: '1', tenantId: '1' },
    },
    description: 'Объект платежа ЮKassa',
  })
  @IsObject()
  object: Record<string, any>;
}
