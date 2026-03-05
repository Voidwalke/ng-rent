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
