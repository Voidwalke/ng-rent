import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/** Интерфейс платёжного провайдера */
export interface PaymentProvider {
  createPayment(
    amount: number,
    currency: string,
    description: string,
    metadata: any,
  ): Promise<{ id: string; confirmationUrl: string }>;
  createRefund(
    paymentId: string,
    amount: number,
  ): Promise<{ id: string; status: string }>;
  verifyWebhook(body: any, signature: string): boolean;
}

/** Реализация провайдера ЮKassa */
@Injectable()
export class YookassaProvider implements PaymentProvider {
  private readonly logger = new Logger(YookassaProvider.name);
  private readonly shopId: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly apiUrl = 'https://api.yookassa.ru/v3';

  constructor(private config: ConfigService) {
    this.shopId = this.config.get<string>('YOOKASSA_SHOP_ID', '');
    this.secretKey = this.config.get<string>('YOOKASSA_SECRET_KEY', '');
    this.webhookSecret = this.config.get<string>('YOOKASSA_WEBHOOK_SECRET', '');
  }

  /** Создаёт платёж через API ЮKassa */
  async createPayment(
    amount: number,
    currency: string,
    description: string,
    metadata: any,
  ) {
    const idempotenceKey = crypto.randomUUID();

    const response = await fetch(`${this.apiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        Authorization:
          'Basic ' +
          Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: { value: amount.toFixed(2), currency },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: this.config.get<string>(
            'YOOKASSA_RETURN_URL',
            'http://localhost:5173/payments/callback',
          ),
        },
        description,
        metadata,
        receipt: {
          customer: { email: metadata.email },
          items: [
            {
              description,
              quantity: '1.00',
              amount: { value: amount.toFixed(2), currency },
              vat_code: 2,
              payment_subject: 'service',
              payment_mode: 'full_payment',
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Ошибка ЮKassa: ${response.status} ${error}`);
      throw new Error(`Ошибка создания платежа: ${response.status}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      confirmationUrl: data.confirmation.confirmation_url,
    };
  }

  /** Создаёт возврат через API ЮKassa */
  async createRefund(paymentId: string, amount: number) {
    const response = await fetch(`${this.apiUrl}/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': crypto.randomUUID(),
        Authorization:
          'Basic ' +
          Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64'),
      },
      body: JSON.stringify({
        payment_id: paymentId,
        amount: { value: amount.toFixed(2), currency: 'RUB' },
      }),
    });

    const data = await response.json();
    return { id: data.id, status: data.status };
  }

  /** Проверяет подпись вебхука */
  verifyWebhook(body: any, signature: string): boolean {
    if (!this.webhookSecret || !signature) return false;
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(JSON.stringify(body));
    const expected = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }
}

/** Мок-провайдер для разработки и тестирования */
export class MockYookassaProvider implements PaymentProvider {
  async createPayment(
    _amount: number,
    _currency: string,
    _description: string,
    _metadata: any,
  ) {
    const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { id, confirmationUrl: `https://yookassa.ru/checkout/mock/${id}` };
  }

  async createRefund(_paymentId: string, _amount: number) {
    return { id: `refund_mock_${Date.now()}`, status: 'succeeded' };
  }

  verifyWebhook(_body: any, _signature: string) {
    return true;
  }
}
