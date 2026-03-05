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

/** Мок-реализация СКУД для разработки */
export class MockAccessControlProvider implements IAccessControlProvider {
  async grantAccess(params: { cardNumber: string; zones: string[] }) {
    console.log(
      `[СКУД Mock] Доступ выдан: ${params.cardNumber}, зоны: ${params.zones.join(', ')}`,
    );
  }

  async revokeAccess(params: { cardNumber: string; reason: string }) {
    console.log(
      `[СКУД Mock] Доступ отозван: ${params.cardNumber}, причина: ${params.reason}`,
    );
  }

  async getCardStatus(
    _cardNumber: string,
  ): Promise<'active' | 'blocked' | 'unknown'> {
    return 'active';
  }
}
