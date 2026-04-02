import type { PropertyType, UnitStatus, TicketPriority } from './models';

export interface CreateClientDto {
  companyName: string;
  inn?: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
}
export type UpdateClientDto = Partial<CreateClientDto>;

export interface CreatePropertyDto {
  name: string;
  address: string;
  type: PropertyType;
  totalArea: number;
  description?: string;
  city?: string;
  floorsCount?: number;
  yearBuilt?: number;
  imageUrl?: string;
}
export type UpdatePropertyDto = Partial<CreatePropertyDto>;

export interface CreateUnitDto {
  propertyId: number;
  floor: number;
  areaSqm: number;
  priceMonth: number;
  status?: UnitStatus;
  description?: string;
}
export type UpdateUnitDto = Partial<Omit<CreateUnitDto, 'propertyId'>>;

export interface FilterUnitDto {
  propertyId?: number;
  status?: UnitStatus;
  priceMin?: number;
  priceMax?: number;
  page?: number;
  limit?: number;
}

export interface CreateApplicationDto {
  unitId: number;
  clientId: number;
  desiredStart: string;
  desiredEnd: string;
  comment?: string;
}

export interface RenewContractDto {
  newEndDate: string;
  newMonthlyRent?: number;
}

export interface ExtendContractDto {
  newEndDate: string;
}

export interface CreateInvoiceDto {
  contractId: number;
  amount: number;
  dueDate: string;
  periodStart?: string;
  periodEnd?: string;
  description?: string;
}

export interface PayInvoiceDto {
  paidAmount: number;
  paymentReference: string;
}

export interface CreditNoteDto {
  invoiceId: number;
  amount: number;
  reason?: string;
}

export interface CreateAccessCardDto {
  clientId: number;
  contractId: number;
  cardNumber: string;
  holderName: string;
  zones?: string[];
  expiresAt?: string;
}

export interface CreateTicketDto {
  subject: string;
  category?: string;
  priority?: TicketPriority;
  message: string;
}

export interface AddMessageDto {
  message: string;
}

export interface CreateContractTemplateDto {
  name: string;
  content: string;
  isDefault?: boolean;
}
export type UpdateContractTemplateDto = Partial<CreateContractTemplateDto>;

export interface CreateMaintenanceDto {
  unitId: number;
  title: string;
  description: string;
  priority?: string;
}
export type UpdateMaintenanceDto = Partial<Omit<CreateMaintenanceDto, 'unitId'>>;

export interface UpdatePreferencesDto {
  settings: {
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    smsNotifications?: boolean;
    [key: string]: unknown;
  };
}

export interface CreateWebhookDto {
  url: string;
  events: string[];
  secret?: string;
}

export interface IndexationPreviewDto {
  rate: number;
}

export interface IndexationApplyDto {
  rate: number;
  contractIds: number[];
}

export interface CreateTenantDto {
  name: string;
  slug: string;
  contactEmail: string;
  inn?: string;
  plan?: string;
}
export type UpdateTenantDto = Partial<CreateTenantDto>;

export interface TenantCreateApplicationDto {
  unitId: number;
  desiredStart: string;
  desiredEnd: string;
  comment?: string;
}
