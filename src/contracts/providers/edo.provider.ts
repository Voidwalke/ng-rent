/** Интерфейс ЭДО-провайдера (Strategy pattern) */
export interface IEdoProvider {
  /** Отправить документ на подпись */
  sendForSigning(
    pdfBuffer: Buffer,
    signers: { name: string; inn: string }[],
  ): Promise<{ documentId: string }>;
  /** Проверить статус подписания */
  checkStatus(
    documentId: string,
  ): Promise<{ status: 'pending' | 'signed' | 'rejected' | 'expired' }>;
  /** Скачать подписанный документ */
  downloadSigned(documentId: string): Promise<Buffer>;
}

/** Мок-провайдер: автоматически "подписывает" через 10 сек */
export class MockEdoProvider implements IEdoProvider {
  private docs = new Map<string, { status: string; createdAt: number }>();

  async sendForSigning(_pdfBuffer: Buffer, _signers: any[]) {
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

/** Провайдер Контур.Диадок (заглушка, требуется API-ключ) */
export class DiadocEdoProvider implements IEdoProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async sendForSigning(
    pdfBuffer: Buffer,
    signers: { name: string; inn: string }[],
  ) {
    const response = await fetch(`${this.apiUrl}/V3/PostMessage`, {
      method: 'POST',
      headers: {
        Authorization: `DiadocAuth ddauth_api_client_id=${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FromBoxId: 'sender-box-id',
        ToBoxId: 'receiver-box-id',
        DocumentAttachments: [
          {
            TypeNamedId: 'Contract',
            SignedContent: {
              Content: pdfBuffer.toString('base64'),
            },
            Signers: signers.map((s) => ({
              SignerDetails: {
                Surname: s.name.split(' ')[0] || '',
                FirstName: s.name.split(' ')[1] || '',
                Inn: s.inn,
              },
            })),
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Diadoc API error: ${response.status}`);
    }

    const data = (await response.json()) as { MessageId: string };
    return { documentId: data.MessageId };
  }

  async checkStatus(documentId: string) {
    const response = await fetch(
      `${this.apiUrl}/V5/GetMessage?messageId=${documentId}`,
      {
        headers: {
          Authorization: `DiadocAuth ddauth_api_client_id=${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return { status: 'pending' as const };
    }

    const data = (await response.json()) as {
      Entities: Array<{
        EntityType: string;
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
    const response = await fetch(
      `${this.apiUrl}/V4/GetEntityContent?messageId=${documentId}`,
      {
        headers: {
          Authorization: `DiadocAuth ddauth_api_client_id=${this.apiKey}`,
        },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      throw new Error(`Diadoc download error: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
