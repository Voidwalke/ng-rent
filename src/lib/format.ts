import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

/**
 * Format a date string to a human-readable Russian format.
 * @example formatDate('2025-03-15') => '15.03.2025'
 */
export function formatDate(value?: string | null, template = 'DD.MM.YYYY'): string {
  if (!value) return '—';
  return dayjs(value).format(template);
}

/**
 * Format a date string with time.
 * @example formatDateTime('2025-03-15T10:30:00Z') => '15.03.2025 10:30'
 */
export function formatDateTime(value?: string | null): string {
  return formatDate(value, 'DD.MM.YYYY HH:mm');
}

/**
 * Format a number as Russian Roubles.
 * @example formatMoney(150000) => '150 000 ₽'
 */
export function formatMoney(value?: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format area in square metres.
 * @example formatArea(123.5) => '123,5 м²'
 */
export function formatArea(value?: number | null): string {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)} м²`;
}

/**
 * Format a percentage value.
 * @example formatPercent(0.85) => '85%'
 */
export function formatPercent(value?: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

/**
 * Relative time string.
 * @example timeAgo('2025-03-14T10:00:00Z') => 'вчера'
 */
export function timeAgo(value?: string | null): string {
  if (!value) return '—';
  const diff = dayjs().diff(dayjs(value), 'minute');
  if (diff < 1) return 'только что';
  if (diff < 60) return `${diff} мин. назад`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  return formatDate(value);
}
