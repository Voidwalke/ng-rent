import { IsUrl, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhooks/ngrent' })
  @IsUrl()
  url: string;

  @ApiProperty({
    example: ['contract.signed', 'invoice.paid', 'maintenance.created'],
    description: 'Список событий для подписки',
  })
  @IsArray()
  @IsString({ each: true })
  events: string[];
}
