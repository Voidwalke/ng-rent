import type {
  ApplicationStatus,
  ContractStatus,
  InvoiceStatus,
  UnitStatus,
  TicketStatus,
  TicketPriority,
  MaintenanceStatus,
  UserRole,
  TenantPlan,
} from '../types';

// ── Status labels (Russian) ───────────────────────────
export const APPLICATION_STATUS_MAP: Record<ApplicationStatus, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: 'default' },
  submitted: { label: 'Подана', color: 'blue' },
  under_review: { label: 'На рассмотрении', color: 'orange' },
  approved: { label: 'Одобрена', color: 'green' },
  rejected: { label: 'Отклонена', color: 'red' },
  contract_sent: { label: 'Договор отправлен', color: 'cyan' },
  signed: { label: 'Подписана', color: 'purple' },
  active: { label: 'Активна', color: 'green' },
  terminated: { label: 'Расторгнута', color: 'red' },
};

export const CONTRACT_STATUS_MAP: Record<ContractStatus, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: 'default' },
  sent: { label: 'Отправлен', color: 'orange' },
  signed: { label: 'Подписан', color: 'blue' },
  active: { label: 'Активен', color: 'green' },
  expired: { label: 'Истёк', color: 'red' },
  terminated: { label: 'Расторгнут', color: 'volcano' },
};

export const INVOICE_STATUS_MAP: Record<InvoiceStatus, { label: string; color: string }> = {
  pending: { label: 'Ожидает оплаты', color: 'orange' },
  paid: { label: 'Оплачен', color: 'green' },
  overdue: { label: 'Просрочен', color: 'red' },
  cancelled: { label: 'Отменён', color: 'default' },
};

export const UNIT_STATUS_MAP: Record<UnitStatus, { label: string; color: string }> = {
  available: { label: 'Свободно', color: 'green' },
  reserved: { label: 'Забронировано', color: 'orange' },
  rented: { label: 'Арендовано', color: 'blue' },
  maintenance: { label: 'Обслуживание', color: 'default' },
};

export const TICKET_STATUS_MAP: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Открыт', color: 'blue' },
  in_progress: { label: 'В работе', color: 'orange' },
  resolved: { label: 'Решён', color: 'green' },
  closed: { label: 'Закрыт', color: 'default' },
};

export const TICKET_PRIORITY_MAP: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Низкий', color: 'default' },
  medium: { label: 'Средний', color: 'orange' },
  high: { label: 'Высокий', color: 'red' },
};

export const MAINTENANCE_STATUS_MAP: Record<MaintenanceStatus, { label: string; color: string }> = {
  new: { label: 'Новая', color: 'blue' },
  in_progress: { label: 'В работе', color: 'orange' },
  completed: { label: 'Завершена', color: 'green' },
  cancelled: { label: 'Отменена', color: 'default' },
};

export const ROLE_MAP: Record<UserRole, string> = {
  super_admin: 'Суперадмин',
  admin: 'Администратор',
  manager: 'Менеджер',
  tenant: 'Арендатор',
};

export const PLAN_MAP: Record<TenantPlan, string> = {
  free: 'Бесплатный',
  basic: 'Базовый',
  pro: 'Профессиональный',
  enterprise: 'Корпоративный',
};

export const PROPERTY_TYPE_MAP: Record<string, string> = {
  office: 'Офис',
  retail: 'Торговая площадь',
  warehouse: 'Склад',
  coworking: 'Коворкинг',
};
