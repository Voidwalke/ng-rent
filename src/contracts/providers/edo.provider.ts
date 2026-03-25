/** Интерфейс ЭДО-провайдера (Strategy pattern) */
export interface EdoSigningOptions {
  fromBoxId?: string;
  toBoxId?: string;
}

export interface IEdoProvider {
  /** Отправляет документ на подпись */
  sendForSigning(
    pdfBuffer: Buffer,
    signers: { name: string; inn: string }[],
    options?: EdoSigningOptions,
  ): Promise<{ documentId: string }>;
  /** Проверяет статус подписания */
  checkStatus(
    documentId: string,
  ): Promise<{ status: 'pending' | 'signed' | 'rejected' | 'expired' }>;
  /** Скачивает подписанный документ */
  downloadSigned(documentId: string): Promise<Buffer>;
}

/** Мок-провайдер: автоматически "подписывает" через 10 сек */
export class MockEdoProvider implements IEdoProvider {
  private docs = new Map<string, { status: string; createdAt: number }>();

  async sendForSigning(
    _pdfBuffer: Buffer,
    _signers: any[],
    _options?: EdoSigningOptions,
  ) {
    const documentId = `edo_mock_${Date.now()}`;
    this.docs.set(documentId, { status: 'pending', createdAt: Date.now() });
    return { documentId };
  }

  async checkStatus(documentId: string) {
    const doc = this.docs.get(documentId);
    if (!doc) return { status: 'expired' as const };

    // Через 10 секунд — подписан
    if (Date.now() - doc.createdAt > 10000) {
      doc.status = 'signed';
      return { status: 'signed' as const };
    }
    return { status: 'pending' as const };
  }

  async downloadSigned(_documentId: string) {
    return Buffer.from('Mock signed PDF content');
  }
}

/** Провайдер Контур.Диадок */
export class DiadocEdoProvider implements IEdoProvider {
  private authToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Получает auth-токен Диадок (кэшируется на 1 час) */
  private async getAuthToken(): Promise<string> {
    if (this.authToken && Date.now() < this.tokenExpiresAt) {
      return this.authToken;
    }

    const response = await fetch(`${this.apiUrl}/V3/Authenticate`, {
      method: 'POST',
      headers: {
        Authorization: `DiadocAuth ddauth_api_client_id=${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Diadoc auth error: ${response.status}`);
    }

    this.authToken = await response.text();
    this.tokenExpiresAt = Date.now() + 3600000; // 1 час
    return this.authToken;
  }

  private async getAuthHeader(): Promise<string> {
    const token = await this.getAuthToken();
    return `DiadocAuth ddauth_api_client_id=${this.apiKey},ddauth_token=${token}`;
  }

  async sendForSigning(
    pdfBuffer: Buffer,
    signers: { name: string; inn: string }[],
    options?: EdoSigningOptions,
  ) {
    if (!options?.fromBoxId || !options?.toBoxId) {
      throw new Error(
        'Для отправки в Диадок необходимы BoxId отправителя и получателя. ' +
          'Укажите edoBoxId в настройках тенанта и клиента.',
      );
    }

    const auth = await this.getAuthHeader();
    const response = await fetch(`${this.apiUrl}/V3/PostMessage`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FromBoxId: options.fromBoxId,
        ToBoxId: options.toBoxId,
        DocumentAttachments: [
          {
            TypeNamedId: 'Contract',
            SignedContent: {
              Content: pdfBuffer.toString('base64'),
            },
            Signers: signers.map((s) => {
              const parts = s.name.split(' ');
              return {
                SignerDetails: {
                  Surname: parts[0] || '',
                  FirstName: parts[1] || '',
                  Patronymic: parts[2] || '',
                  Inn: s.inn,
                },
              };
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Diadoc API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { MessageId: string };
    return { documentId: data.MessageId };
  }

  async checkStatus(documentId: string) {
    const auth = await this.getAuthHeader();
    const response = await fetch(
      `${this.apiUrl}/V5/GetMessage?messageId=${documentId}`,
      {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      throw new Error(`Diadoc checkStatus error: ${response.status}`);
    }

    const data = (await response.json()) as {
      Entities: Array<{
        EntityType: string;
        EntityId?: string;
        DocumentInfo?: {
          DocflowStatus?: { PrimaryStatus?: { Severity: string } };
        };
      }>;
    };
    const docEntity = data.Entities?.find(
      (e: any) => e.EntityType === 'Attachment',
    );
    const severity =
      docEntity?.DocumentInfo?.DocflowStatus?.PrimaryStatus?.Severity;

    if (severity === 'Success') return { status: 'signed' as const };
    if (severity === 'Error') return { status: 'rejected' as const };
    return { status: 'pending' as const };
  }

  async downloadSigned(documentId: string) {
    const auth = await this.getAuthHeader();

    // Сначала получаем entityId из сообщения
    const msgResponse = await fetch(
      `${this.apiUrl}/V5/GetMessage?messageId=${documentId}`,
      {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!msgResponse.ok) {
      throw new Error(`Diadoc getMessage error: ${msgResponse.status}`);
    }

    const msgData = (await msgResponse.json()) as {
      Entities: Array<{ EntityType: string; EntityId: string }>;
    };
    const entity = msgData.Entities?.find(
      (e: any) => e.EntityType === 'Attachment',
    );
    if (!entity?.EntityId) {
      throw new Error('Не найден документ в сообщении Диадок');
    }

    // Скачиваем содержимое по entityId
    const response = await fetch(
      `${this.apiUrl}/V4/GetEntityContent?messageId=${documentId}&entityId=${entity.EntityId}`,
      {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      throw new Error(`Diadoc download error: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
