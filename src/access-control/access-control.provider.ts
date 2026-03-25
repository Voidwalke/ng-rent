import { Logger } from '@nestjs/common';

/** Интерфейс СКУД-провайдера (паттерн Стратегия) */
export interface IAccessControlProvider {
  grantAccess(params: {
    cardNumber: string;
    zones: string[];
    validFrom: Date;
    validTo: Date;
  }): Promise<void>;

  revokeAccess(params: { cardNumber: string; reason: string }): Promise<void>;

  getCardStatus(cardNumber: string): Promise<'active' | 'blocked' | 'unknown'>;
}

/**
 * Мок-реализация СКУД с хранением состояния.
 *
 * В продакшене заменяется на SigurAccessControlProvider,
 * который работает через OIF (TCP порт 3312) или REST API (порт 9500).
 *
 * Протокол Sigur OIF:
 *   LOGIN 1.8 <login> <password>\r\n
 *   ALLOWPASS <ap_id> <card_id> UNKNOWN\r\n
 *   DENYPASS <ap_id> <card_id>\r\n
 *
 * Документация: Sigur REST API Guide, Sigur OIF Protocol
 */
export class MockAccessControlProvider implements IAccessControlProvider {
  private readonly logger = new Logger('СКУД');
  private readonly cards = new Map<
    string,
    { status: 'active' | 'blocked'; zones: string[]; grantedAt: Date }
  >();

  async grantAccess(params: {
    cardNumber: string;
    zones: string[];
    validFrom: Date;
    validTo: Date;
  }) {
    this.cards.set(params.cardNumber, {
      status: 'active',
      zones: params.zones,
      grantedAt: new Date(),
    });

    this.logger.log(
      `Доступ выдан: карта ${params.cardNumber}, зоны: [${params.zones.join(', ')}], ` +
        `срок: ${params.validFrom.toLocaleDateString('ru-RU')} — ${params.validTo.toLocaleDateString('ru-RU')}`,
    );
  }

  async revokeAccess(params: { cardNumber: string; reason: string }) {
    const card = this.cards.get(params.cardNumber);
    if (card) {
      card.status = 'blocked';
    } else {
      this.cards.set(params.cardNumber, {
        status: 'blocked',
        zones: [],
        grantedAt: new Date(),
      });
    }

    this.logger.warn(
      `Доступ отозван: карта ${params.cardNumber}, причина: ${params.reason}`,
    );
  }

  async getCardStatus(
    cardNumber: string,
  ): Promise<'active' | 'blocked' | 'unknown'> {
    const card = this.cards.get(cardNumber);
    const status = card?.status || 'unknown';
    this.logger.debug(`Статус карты ${cardNumber}: ${status}`);
    return status;
  }
}
