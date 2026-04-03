import api from './client';
import type {
  PaginatedResponse,
  PaginationParams,
  LoginDto,
  RegisterDto,
  VerifyOtpDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AcceptInviteDto,
  AuthResponse,
  LoginResponse,
  UserProfile,
  Session,
  Property,
  PropertyImage,
  PropertyStats,
  Unit,
  Client,
  Application,
  Contract,
  Invoice,
  Payment,
  AccessCard,
  AccessCardQrData,
  Notification,
  SupportTicket,
  SupportMessage,
  Document,
  ContractTemplate,
  MaintenanceRequest,
  Subscription,
  SubscriptionPlan,
  Tenant,
  DashboardKpi,
  RevenuePoint,
  OccupancyPoint,
  AgedDebt,
  CashflowPoint,
  ActivityEvent,
  OnboardingProgress,
  CreatePropertyDto,
  UpdatePropertyDto,
  CreateUnitDto,
  UpdateUnitDto,
  FilterUnitDto,
  CreateClientDto,
  UpdateClientDto,
  CreateApplicationDto,
  RenewContractDto,
  ExtendContractDto,
  CreateInvoiceDto,
  PayInvoiceDto,
  CreditNoteDto,
  CreateAccessCardDto,
  CreateTicketDto,
  AddMessageDto,
  CreateContractTemplateDto,
  UpdateContractTemplateDto,
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  UpdatePreferencesDto,
  CreateWebhookDto,
  IndexationPreviewDto,
  IndexationApplyDto,
  CreateTenantDto,
  UpdateTenantDto,
  TenantCreateApplicationDto,
} from '../types';

// ── Auth ──────────────────────────────────────────────
export const authApi = {
  login: (dto: LoginDto) =>
    api.post<LoginResponse>('/auth/login', dto).then((r) => r.data),
  register: (dto: RegisterDto) =>
    api.post<AuthResponse>('/auth/register', dto).then((r) => r.data),
  verifyOtp: (dto: VerifyOtpDto) =>
    api.post<AuthResponse>('/auth/2fa/verify', dto).then((r) => r.data),
  refresh: (refreshToken: string) =>
    api.post<AuthResponse>('/auth/refresh', { refreshToken }).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<UserProfile>('/auth/me').then((r) => r.data),
  changePassword: (dto: ChangePasswordDto) =>
    api.post('/auth/change-password', dto),
  forgotPassword: (dto: ForgotPasswordDto) =>
    api.post('/auth/forgot-password', dto),
  resetPassword: (dto: ResetPasswordDto) =>
    api.post('/auth/reset-password', dto),
  acceptInvite: (dto: AcceptInviteDto) =>
    api.post<AuthResponse>('/auth/accept-invite', dto).then((r) => r.data),
  /** Email 2FA: без code — отправляет OTP, с code — подтверждает и включает */
  enable2fa: (code?: string) =>
    api.post<{ message: string }>('/auth/2fa/enable', code ? { code } : {}).then((r) => r.data),
  send2faCode: () =>
    api.post<{ message: string }>('/auth/2fa/send').then((r) => r.data),
  /** Отключить 2FA: TOTP-код, email OTP или пароль */
  disable2fa: (dto: { code?: string; password?: string }) =>
    api.post('/auth/2fa/disable', dto).then((r) => r.data),
  /** TOTP: генерация QR-кода */
  enableTotp: () =>
    api.post<{ qrCode: string; secret: string; otpauthUrl: string }>('/auth/2fa/totp/enable').then((r) => r.data),
  /** TOTP: подтверждение первым кодом из приложения */
  confirmTotp: (code: string) =>
    api.post<{ message: string }>('/auth/2fa/totp/confirm', { code }).then((r) => r.data),
  sessions: () =>
    api.get('/auth/sessions').then((r) => unwrapArray<Session>(r.data)),
  revokeSession: (id: string) =>
    api.delete(`/auth/sessions/${id}`),
  revokeAllSessions: () =>
    api.delete('/auth/sessions'),
  updateProfile: (dto: { fullName?: string; phone?: string }) =>
    api.patch<UserProfile>('/auth/profile', dto).then((r) => r.data),
};

// ── Properties ────────────────────────────────────────
export const propertiesApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Property>>('/properties', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Property>(`/properties/${id}`).then((r) => r.data),
  create: (dto: CreatePropertyDto) =>
    api.post<Property>('/properties', dto).then((r) => r.data),
  update: (id: number, dto: UpdatePropertyDto) =>
    api.patch<Property>(`/properties/${id}`, dto).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/properties/${id}`),
  stats: (id: number) =>
    api.get<PropertyStats>(`/properties/${id}/stats`).then((r) => r.data),
  publish: (id: number) =>
    api.patch(`/properties/${id}/publish`).then((r) => r.data),
  unpublish: (id: number) =>
    api.patch(`/properties/${id}/unpublish`).then((r) => r.data),
  uploadImage: (id: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<Property>(`/properties/${id}/image`, fd).then((r) => r.data);
  },
  getImages: (propertyId: number) =>
    api.get(`/properties/${propertyId}/images`).then((r) => {
      const d = r.data;
      if (Array.isArray(d)) return d;
      if (d && typeof d === 'object' && Array.isArray(d.data)) return d.data;
      return [];
    }),
  addGalleryImage: (propertyId: number, file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (caption) fd.append('caption', caption);
    return api
      .post<PropertyImage>(`/properties/${propertyId}/images`, fd, {
        // axios auto-sets Content-Type for FormData
      })
      .then((r) => r.data);
  },
  deleteGalleryImage: (propertyId: number, imageId: number) =>
    api.delete(`/properties/${propertyId}/images/${imageId}`).then((r) => r.data),
  reorderImage: (propertyId: number, imageId: number, direction: 'up' | 'down') =>
    api.patch(`/properties/${propertyId}/images/${imageId}/reorder`, { direction }).then((r) => r.data),
};

// ── Units ─────────────────────────────────────────────
export const unitsApi = {
  list: (params?: FilterUnitDto) =>
    api.get<PaginatedResponse<Unit>>('/units', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Unit>(`/units/${id}`).then((r) => r.data),
  create: (dto: CreateUnitDto) =>
    api.post<Unit>('/units', dto).then((r) => r.data),
  update: (id: number, dto: UpdateUnitDto) =>
    api.patch<Unit>(`/units/${id}`, dto).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/units/${id}`),
  setMaintenance: (id: number) =>
    api.patch(`/units/${id}/maintenance`).then((r) => r.data),
  setAvailable: (id: number) =>
    api.patch(`/units/${id}/available`).then((r) => r.data),
};

// ── Clients ───────────────────────────────────────────
export const clientsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Client>>('/clients', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Client>(`/clients/${id}`).then((r) => r.data),
  create: (dto: CreateClientDto) =>
    api.post<Client>('/clients', dto).then((r) => r.data),
  update: (id: number, dto: UpdateClientDto) =>
    api.patch<Client>(`/clients/${id}`, dto).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/clients/${id}`),
  history: (id: number) =>
    api.get(`/clients/${id}/history`).then((r) => r.data),
};

// ── Applications ──────────────────────────────────────
export const applicationsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Application>>('/applications', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Application>(`/applications/${id}`).then((r) => r.data),
  create: (dto: CreateApplicationDto) =>
    api.post<Application>('/applications', dto).then((r) => r.data),
  submit: (id: number) =>
    api.patch<Application>(`/applications/${id}/submit`).then((r) => r.data),
  review: (id: number) =>
    api.patch<Application>(`/applications/${id}/review`).then((r) => r.data),
  approve: (id: number) =>
    api.patch<Application>(`/applications/${id}/approve`).then((r) => r.data),
  reject: (id: number, reason: string) =>
    api.patch<Application>(`/applications/${id}/reject`, { rejectionReason: reason }).then((r) => r.data),
};

// ── Contracts ─────────────────────────────────────────
export const contractsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Contract>>('/contracts', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Contract>(`/contracts/${id}`).then((r) => r.data),
  generate: (applicationId: number) =>
    api.post<Contract>(`/contracts/${applicationId}/generate`).then((r) => r.data),
  sign: (id: number) =>
    api.patch<Contract>(`/contracts/${id}/sign`).then((r) => r.data),
  terminate: (id: number, dto: { reason?: string; depositAction?: 'return' | 'withhold' | 'partial'; depositWithheldAmount?: number; depositWithheldReason?: string }) =>
    api.patch<Contract>(`/contracts/${id}/terminate`, dto).then((r) => r.data),
  renew: (id: number, dto: RenewContractDto) =>
    api.post<Contract>(`/contracts/${id}/renew`, dto).then((r) => r.data),
  extend: (id: number, dto: ExtendContractDto) =>
    api.patch<Contract>(`/contracts/${id}/extend`, dto).then((r) => r.data),
  downloadPdf: (id: number) =>
    api.get(`/contracts/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  sendEdo: (id: number) =>
    api.post(`/contracts/${id}/edo/send`).then((r) => r.data),
  expiring: (days?: number) =>
    api.get('/contracts/expiring', { params: { days } }).then((r) => unwrapArray<Contract>(r.data)),
  edoStatus: (id: number) =>
    api.get(`/contracts/${id}/edo/status`).then((r) => r.data),
  indexationPreview: (dto: IndexationPreviewDto) =>
    api.post('/rent-indexation/preview', dto).then((r) => r.data),
  indexationApply: (dto: IndexationApplyDto) =>
    api.post('/rent-indexation/apply', dto).then((r) => r.data),
};

// ── Invoices ──────────────────────────────────────────
export const invoicesApi = {
  list: (params?: PaginationParams & { status?: string; contractId?: number }) =>
    api.get<PaginatedResponse<Invoice>>('/invoices', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Invoice>(`/invoices/${id}`).then((r) => r.data),
  create: (dto: CreateInvoiceDto) =>
    api.post<Invoice>('/invoices', dto).then((r) => r.data),
  pay: (id: number, dto: PayInvoiceDto) =>
    api.post<Invoice>(`/invoices/${id}/pay`, dto).then((r) => r.data),
  cancel: (id: number) =>
    api.patch<Invoice>(`/invoices/${id}/cancel`).then((r) => r.data),
  summary: () =>
    api.get('/invoices/summary').then((r) => r.data),
  creditNote: (dto: CreditNoteDto) =>
    api.post('/invoices/credit-note', dto).then((r) => r.data),
  generateBatch: (contractIds: number[]) =>
    api.post('/invoices/generate-batch', { contractIds }).then((r) => r.data),
  downloadDocument: (id: number) =>
    api.get(`/invoices/${id}/document`, { responseType: 'blob' }).then((r) => r.data),
  downloadSchetFaktura: (id: number) =>
    api.get(`/invoices/${id}/schet-faktura`, { responseType: 'blob' }).then((r) => r.data),
};

// ── Payments ──────────────────────────────────────────
export const paymentsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Payment>>('/payments', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Payment>(`/payments/${id}`).then((r) => r.data),
  createOnline: (invoiceId: number) =>
    api.post<{ paymentId: number; confirmationUrl: string | null }>(`/payments/invoice/${invoiceId}`).then((r) => r.data),
  refund: (invoiceId: number, amount?: number) =>
    api.post(`/payments/invoice/${invoiceId}/refund`, { amount }).then((r) => r.data),
  /** Имитация вебхука ЮKassa (для демо-режима) */
  simulateWebhook: (externalId: string) =>
    api.post('/payments/webhook/yookassa', {
      type: 'notification',
      event: 'payment.succeeded',
      object: { id: externalId, payment_method: { type: 'bank_card' } },
    }).then((r) => r.data),
};

// ── Access Cards ──────────────────────────────────────
export const accessCardsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<AccessCard>>('/access-cards', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<AccessCard>(`/access-cards/${id}`).then((r) => r.data),
  create: (dto: CreateAccessCardDto) =>
    api.post<AccessCard>('/access-cards', dto).then((r) => r.data),
  block: (id: number, reason?: string) =>
    api.patch<AccessCard>(`/access-cards/${id}/block`, { reason }).then((r) => r.data),
  unblock: (id: number) =>
    api.patch<AccessCard>(`/access-cards/${id}/unblock`).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/access-cards/${id}`),
  getQr: (id: number) =>
    api.get<AccessCardQrData>(`/access-cards/${id}/qr`).then((r) => r.data),
};

// ── Notifications ─────────────────────────────────────
export const notificationsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Notification>>('/notifications', { params }).then((r) => r.data),
  markRead: (id: number) =>
    api.patch(`/notifications/${id}/read`),
  markAllRead: () =>
    api.patch('/notifications/read-all'),
  unreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count').then((r) => {
      const payload = r.data as unknown as { count: number } | number;
      return typeof payload === 'number' ? payload : payload.count;
    }),
};

// ── Support Tickets ───────────────────────────────────
export const ticketsApi = {
  list: (params?: PaginationParams & { status?: string }) =>
    api.get<PaginatedResponse<SupportTicket>>('/support/tickets', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<SupportTicket & { messages: SupportMessage[] }>(`/support/tickets/${id}`).then((r) => r.data),
  create: (dto: CreateTicketDto) =>
    api.post<SupportTicket>('/support/tickets', dto).then((r) => r.data),
  addMessage: (id: number, dto: AddMessageDto) =>
    api.post<SupportMessage>(`/support/tickets/${id}/messages`, dto).then((r) => r.data),
  resolve: (id: number) =>
    api.patch(`/support/tickets/${id}/resolve`).then((r) => r.data),
  close: (id: number) =>
    api.patch(`/support/tickets/${id}/close`).then((r) => r.data),
};

// ── Platform Support (Super Admin) ───────────────────
export const platformSupportApi = {
  list: (params?: PaginationParams & { status?: string }) =>
    api.get('/support/platform/tickets', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get(`/support/platform/tickets/${id}`).then((r) => r.data),
  reply: (id: number, message: string) =>
    api.post(`/support/platform/tickets/${id}/reply`, { message }).then((r) => r.data),
  resolve: (id: number) =>
    api.patch(`/support/platform/tickets/${id}/resolve`).then((r) => r.data),
  close: (id: number) =>
    api.patch(`/support/platform/tickets/${id}/close`).then((r) => r.data),
};

// ── Documents ─────────────────────────────────────────
export const documentsApi = {
  list: (entityType: string, entityId: number) =>
    api.get(`/documents/entity/${entityType}/${entityId}`).then((r) => unwrapArray<Document>(r.data)),
  upload: (file: File, entityType: string, entityId: number, category?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    fd.append('entityId', String(entityId));
    if (category) fd.append('category', category);
    return api
      .post<Document>('/documents', fd, {
        // axios auto-sets Content-Type for FormData
      })
      .then((r) => r.data);
  },
  download: (id: number) =>
    api.get(`/documents/${id}/download`).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/documents/${id}`).then((r) => r.data),
};

// ── Contract Templates ────────────────────────────────
export const templatesApi = {
  list: () =>
    api.get('/contract-templates').then((r) => unwrapArray<ContractTemplate>(r.data)),
  get: (id: number) =>
    api.get<ContractTemplate>(`/contract-templates/${id}`).then((r) => r.data),
  create: (dto: CreateContractTemplateDto) =>
    api.post<ContractTemplate>('/contract-templates', dto).then((r) => r.data),
  update: (id: number, dto: UpdateContractTemplateDto) =>
    api.patch<ContractTemplate>(`/contract-templates/${id}`, dto).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/contract-templates/${id}`),
};

// ── Maintenance ───────────────────────────────────────
export const maintenanceApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<MaintenanceRequest>>('/maintenance', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<MaintenanceRequest>(`/maintenance/${id}`).then((r) => r.data),
  create: (dto: CreateMaintenanceDto) =>
    api.post<MaintenanceRequest>('/maintenance', dto).then((r) => r.data),
  update: (id: number, dto: UpdateMaintenanceDto) =>
    api.patch<MaintenanceRequest>(`/maintenance/${id}`, dto).then((r) => r.data),
};

// ── Dashboard / Analytics ─────────────────────────────
export const dashboardApi = {
  kpi: () =>
    api.get<DashboardKpi>('/analytics/dashboard').then((r) => r.data),
  revenue: (months?: number) =>
    api.get('/analytics/revenue', { params: { months } }).then((r) => unwrapArray<RevenuePoint>(r.data)),
  occupancy: () =>
    api.get('/analytics/occupancy').then((r) => unwrapArray<OccupancyPoint>(r.data)),
  agedDebt: () =>
    api.get('/analytics/aged-debt').then((r) => {
      const raw = r.data as { totals?: Record<string, { count: number; amount: number }> };
      if (raw?.totals) {
        return Object.entries(raw.totals).map(([range, { count, amount }]) => ({ range, count, amount })) as AgedDebt[];
      }
      return unwrapArray<AgedDebt>(r.data);
    }),
  cashflow: (months?: number) =>
    api.get('/analytics/cashflow', { params: { months } }).then((r) => unwrapArray<CashflowPoint>(r.data)),
  activity: (limit?: number) =>
    api.get('/activity', { params: { limit } }).then((r) => unwrapArray<ActivityEvent>(r.data)),
  vacancyCost: () =>
    api.get('/analytics/vacancy-cost').then((r) => r.data),
  topDebtors: () =>
    api.get('/analytics/top-debtors').then((r) => unwrapArray(r.data)),
  avgPaymentDays: (months?: number) =>
    api.get('/analytics/avg-payment-days', { params: { months } }).then((r) => r.data),
  revenueByProperty: (months?: number) =>
    api.get('/analytics/revenue-by-property', { params: { months } }).then((r) => unwrapArray(r.data)),
  forecast: (months?: number) =>
    api.get('/analytics/forecast', { params: { months } }).then((r) => unwrapArray(r.data)),
  export: (format?: string) =>
    api.get('/analytics/export', { params: { format }, responseType: 'blob' }).then((r) => r.data),
};

// ── Subscription / Billing ────────────────────────────
export const subscriptionApi = {
  current: () =>
    api.get<Subscription>('/subscriptions/current').then((r) => r.data),
  plans: () =>
    api.get('/subscriptions/plans').then((r) => unwrapArray<SubscriptionPlan>(r.data)),
  changePlan: (plan: string) =>
    api.post('/subscriptions/change-plan', { plan }).then((r) => r.data),
  cancel: (reason?: string) =>
    api.post('/subscriptions/cancel', { reason }).then((r) => r.data),
  invoices: (params?: PaginationParams) =>
    api.get('/subscriptions/invoices', { params }).then((r) => r.data),
  pay: (invoiceId?: number) =>
    api.post(invoiceId ? `/subscriptions/pay/${invoiceId}` : '/subscriptions/pay').then((r) => r.data),
};

// ── Users (admin) ─────────────────────────────────────
export const usersApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<UserProfile>>('/users', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<UserProfile>(`/users/${id}`).then((r) => r.data),
  invite: (email: string, fullName: string, role: string) =>
    api.post('/auth/invite', { email, fullName, role }).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data).then((r) => r.data),
  remove: (id: number) =>
    api.delete(`/users/${id}`).then((r) => r.data),
};

// ── Settings ──────────────────────────────────────────
export const settingsApi = {
  getPreferences: () =>
    api.get('/notification-preferences').then((r) => r.data),
  updatePreferences: (dto: UpdatePreferencesDto) =>
    api.patch('/notification-preferences', dto).then((r) => r.data),
  webhooks: () =>
    api.get('/notification-preferences/webhooks').then((r) => unwrapArray(r.data)),
  createWebhook: (dto: CreateWebhookDto) =>
    api.post('/notification-preferences/webhooks', dto).then((r) => r.data),
  deleteWebhook: (id: number) =>
    api.delete(`/notification-preferences/webhooks/${id}`).then((r) => r.data),
  getOnboarding: () =>
    api.get<OnboardingProgress>('/onboarding').then((r) => r.data),
  completeOnboardingStep: (step: string) =>
    api.patch('/onboarding/complete-step', { step }).then((r) => r.data),
  skipOnboarding: () =>
    api.patch('/onboarding/skip').then((r) => r.data),
};

// ── Super-Admin: Tenants ──────────────────────────────
export const tenantsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Tenant>>('/tenants', { params }).then((r) => r.data),
  get: (id: number) =>
    api.get<Tenant>(`/tenants/${id}`).then((r) => r.data),
  create: (dto: CreateTenantDto) =>
    api.post<Tenant>('/tenants', dto).then((r) => r.data),
  update: (id: number, dto: UpdateTenantDto) =>
    api.patch<Tenant>(`/tenants/${id}`, dto).then((r) => r.data),
  remove: (id: number) =>
    api.delete(`/tenants/${id}`).then((r) => r.data),
  toggle: (id: number) =>
    api.patch(`/tenants/${id}/toggle`).then((r) => r.data),
};

// ── Import ───────────────────────────────────────────
export const importApi = {
  template: (type: string) =>
    api.get('/import/template', { params: { type }, responseType: 'blob' }).then((r) => r.data),
  upload: (type: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/import/${type}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  confirm: (id: number) =>
    api.post(`/import/confirm/${id}`).then((r) => r.data),
  jobs: () =>
    api.get('/import/jobs').then((r) => r.data),
};

// ── Integration 1C ───────────────────────────────────
export const integration1cApi = {
  health: () =>
    api.get('/integration/1c/health').then((r) => r.data),
  export: () =>
    api.post('/integration/1c/export').then((r) => r.data),
  changes: (since?: string) =>
    api.get('/integration/1c/changes', { params: since ? { since } : {} }).then((r) => r.data),
};

// ── Compliance (152-ФЗ) ──────────────────────────────
export const complianceApi = {
  consents: () =>
    api.get('/compliance/consents').then((r) => unwrapArray(r.data)),
  recordConsent: (type: string) =>
    api.post('/compliance/consent', { type }).then((r) => r.data),
  revokeConsent: (id: number) =>
    api.delete(`/compliance/consent/${id}`).then((r) => r.data),
  requestDataExport: () =>
    api.post('/compliance/data-export').then((r) => r.data),
  dataExportStatus: () =>
    api.get('/compliance/data-export').then((r) => r.data),
  deleteAccount: () =>
    api.post('/compliance/delete-account').then((r) => r.data),
};

// ── Platform Analytics (Super-Admin) ─────────────────
export const platformAnalyticsApi = {
  mrr: () =>
    api.get('/platform/analytics/mrr').then((r) => r.data),
  tenants: () =>
    api.get('/platform/analytics/tenants').then((r) => r.data),
  funnel: () =>
    api.get('/platform/analytics/funnel').then((r) => r.data),
  churn: () =>
    api.get('/platform/analytics/churn').then((r) => r.data),
  users: (params?: PaginationParams) =>
    api.get('/platform/analytics/users', { params }).then((r) => r.data),
  payments: (params?: PaginationParams) =>
    api.get('/platform/analytics/payments', { params }).then((r) => r.data),
  audit: (params?: PaginationParams) =>
    api.get('/platform/analytics/audit', { params }).then((r) => r.data),
  // Django-style admin
  models: () =>
    api.get('/platform/analytics/models').then((r) => r.data),
  modelSchema: (model: string) =>
    api.get(`/platform/analytics/models/${model}/schema`).then((r) => r.data),
  browseModel: (model: string, params?: any) =>
    api.get(`/platform/analytics/models/${model}`, { params }).then((r) => r.data),
  getRecord: (model: string, id: number) =>
    api.get(`/platform/analytics/models/${model}/${id}`).then((r) => r.data),
  updateRecord: (model: string, id: number, data: any) =>
    api.patch(`/platform/analytics/models/${model}/${id}`, data).then((r) => r.data),
  deleteRecord: (model: string, id: number) =>
    api.delete(`/platform/analytics/models/${model}/${id}`).then((r) => r.data),
  createRecord: (model: string, data: any) =>
    api.post(`/platform/analytics/models/${model}`, data).then((r) => r.data),
  bulkDelete: (model: string, ids: number[]) =>
    api.post(`/platform/analytics/models/${model}/bulk-delete`, { ids }).then((r) => r.data),
  system: () =>
    api.get('/platform/analytics/system').then((r) => r.data),
  tenantDetail: (id: number) =>
    api.get(`/platform/analytics/tenants/${id}/detail`).then((r) => r.data),
  changePlan: (id: number, plan: string) =>
    api.patch(`/platform/analytics/tenants/${id}/plan`, { plan }).then((r) => r.data),
  extendTrial: (id: number, days: number) =>
    api.patch(`/platform/analytics/tenants/${id}/extend-trial`, { days }).then((r) => r.data),
  resetPassword: (userId: number) =>
    api.patch(`/platform/analytics/users/${userId}/reset-password`).then((r) => r.data),
  toggleUser: (userId: number) =>
    api.patch(`/platform/analytics/users/${userId}/toggle`).then((r) => r.data),
  forceLogout: (userId: number) =>
    api.patch(`/platform/analytics/users/${userId}/force-logout`).then((r) => r.data),
  broadcast: (title: string, msg: string) =>
    api.post('/platform/analytics/broadcast', { title, message: msg }).then((r) => r.data),
  exportPlatform: () =>
    api.get('/platform/analytics/export', { responseType: 'blob' }).then((r) => r.data),
};

// Helper: extract array from possibly-paginated response
function unwrapArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'data' in data) return (data as { data: T[] }).data;
  return [];
}

// ── Catalog (public) ─────────────────────────────────
export const catalogApi = {
  properties: (params?: PaginationParams & { type?: string; city?: string }) =>
    api.get<PaginatedResponse<Property>>('/catalog/properties', { params }).then((r) => r.data),
  propertyDetail: (id: number) =>
    api.get<Property & { units?: Unit[] }>(`/catalog/properties/${id}`).then((r) => r.data),
};

// ── Tenant Portal ─────────────────────────────────────
export const tenantPortalApi = {
  myApplications: (params?: PaginationParams) =>
    api.get('/my/applications', { params }).then((r) => unwrapArray(r.data)),
  createApplication: (dto: TenantCreateApplicationDto) =>
    api.post('/my/applications', dto).then((r) => r.data),
  getApplication: (id: number) =>
    api.get(`/my/applications/${id}`).then((r) => r.data),
  myContracts: (params?: PaginationParams) =>
    api.get('/my/contracts', { params }).then((r) => unwrapArray(r.data)),
  getContract: (id: number) =>
    api.get(`/my/contracts/${id}`).then((r) => r.data),
  myInvoices: (params?: PaginationParams) =>
    api.get('/my/invoices', { params }).then((r) => unwrapArray(r.data)),
  getInvoice: (id: number) =>
    api.get(`/my/invoices/${id}`).then((r) => r.data),
  payInvoice: (id: number) =>
    api.post<{ paymentId: number; confirmationUrl: string | null }>(`/my/invoices/${id}/pay`).then((r) => r.data),
  myAccessCards: () =>
    api.get('/my/access-cards').then((r) => unwrapArray(r.data)),
  getCardQr: (id: number) =>
    api.get<AccessCardQrData>(`/my/access-cards/${id}/qr`).then((r) => r.data),
  myDocuments: () =>
    api.get('/my/documents').then((r) => unwrapArray(r.data)),
  myMaintenance: () =>
    api.get('/my/maintenance').then((r) => unwrapArray(r.data)),
  createMaintenance: (dto: { title: string; description: string; priority?: string; unitId?: number }) =>
    api.post('/my/maintenance', dto).then((r) => r.data),
  acceptContract: (id: number) =>
    api.patch<Contract>(`/my/contracts/${id}/accept`).then((r) => r.data),
  getProfile: () =>
    api.get('/my/profile').then((r) => r.data),
};
