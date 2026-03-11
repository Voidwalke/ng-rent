import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExportPayload1C {
  type: 'invoice' | 'payment' | 'contract' | 'client';
  tenantId: number;
  entityId: number;
  data: Record<string, any>;
}

export interface ImportPayload1C {
  type: 'payment_confirmation' | 'client_update';
  externalId: string;
  data: Record<string, any>;
}

@Injectable()
export class Integration1CProvider {
  private readonly logger = new Logger(Integration1CProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get(
      'INTEGRATION_1C_URL',
      'http://localhost:8080/api/1c',
    );
    this.apiKey = this.config.get('INTEGRATION_1C_API_KEY', '');
  }

  /** Экспортирует сущность в 1С */
  async exportEntity(
    payload: ExportPayload1C,
  ): Promise<{ success: boolean; externalId?: string }> {
    const endpoint = `${this.baseUrl}/import/${payload.type}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          tenantId: payload.tenantId,
          entityId: payload.entityId,
          ...payload.data,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `Ошибка экспорта в 1С: ${response.status} ${response.statusText}`,
        );
        return { success: false };
      }

      const result = await response.json();
      this.logger.log(
        `Экспорт в 1С: ${payload.type} #${payload.entityId} → ${result.externalId}`,
      );
      return { success: true, externalId: result.externalId };
    } catch (err: any) {
      this.logger.error(`1С недоступна: ${err.message}`);
      return { success: false };
    }
  }

  /** Загружает справочник контрагентов из 1С */
  async fetchClients(tenantId: number): Promise<any[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/export/clients?tenantId=${tenantId}`,
        {
          headers: { 'X-API-Key': this.apiKey },
        },
      );

      if (!response.ok) return [];
      return await response.json();
    } catch (err: any) {
      this.logger.error(`1С fetchClients: ${err.message}`);
      return [];
    }
  }

  /** Проверяет доступность 1С */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
