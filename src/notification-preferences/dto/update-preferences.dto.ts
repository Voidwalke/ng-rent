import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({
    example: {
      email: true,
      push: false,
      invoiceReminder: true,
      contractExpiry: true,
      maintenanceUpdates: true,
      paymentConfirmation: false,
    },
    description: 'Настройки уведомлений',
  })
  @IsObject()
  settings: Record<string, boolean>;
}
