import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  Registry,
} from 'prom-client';

/** Сервис сбора метрик для Prometheus */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** Количество HTTP-запросов */
  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Общее количество HTTP-запросов',
    labelNames: ['method', 'path', 'status'],
    registers: [this.registry],
  });

  /** Длительность HTTP-запросов */
  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Длительность обработки HTTP-запросов',
    labelNames: ['method', 'path'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  /** Количество активных WebSocket-соединений */
  readonly wsConnections = new Gauge({
    name: 'ws_connections_active',
    help: 'Количество активных WebSocket-соединений',
    registers: [this.registry],
  });

  /** Количество задач в очереди */
  readonly queueSize = new Gauge({
    name: 'queue_messages_count',
    help: 'Количество сообщений в очереди',
    labelNames: ['queue'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  /** Возвращает метрики в формате Prometheus */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
