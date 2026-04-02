export type PropertyType = 'office' | 'retail' | 'warehouse' | 'coworking';

export interface Property {
  id: number;
  tenantId: number;
  name: string;
  address: string;
  city?: string;
  type: PropertyType;
  totalArea: number;
  floorsCount?: number;
  yearBuilt?: number;
  description?: string;
  imageUrl?: string;
  images?: PropertyImage[];
  isPublished: boolean;
  createdAt: string;
}

export interface PropertyImage {
  id: number;
  propertyId: number;
  imageUrl: string;
  caption?: string;
  sortOrder: number;
  createdAt: string;
}

export interface PropertyStats {
  unitsByStatus: {
    available: number;
    reserved: number;
    rented: number;
    maintenance: number;
  };
  totalArea: number;
  rentedArea: number;
  occupancyRate: number;
}

export type UnitStatus = 'available' | 'reserved' | 'rented' | 'maintenance';

export interface Unit {
  id: number;
  tenantId: number;
  propertyId: number;
  property?: Property;
  unitNumber?: string;
  floor: number;
  areaSqm: number;
  status: UnitStatus;
  priceMonth: number;
  description?: string;
  amenities?: string[];
  createdAt: string;
}

export interface Client {
  id: number;
  tenantId: number;
  companyName: string;
  inn?: string;
  kpp?: string;
  legalAddress?: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  bankAccount?: string;
  bik?: string;
  userId?: number;
  overdueAmount?: number;
  createdAt: string;
}

export type ApplicationStatus =
  | 'draft' | 'submitted' | 'under_review' | 'approved'
  | 'rejected' | 'contract_sent' | 'signed' | 'active' | 'terminated';

export interface Application {
  id: number;
  tenantId: number;
  unitId: number;
  unit?: Unit;
  clientId: number;
  client?: Client;
  status: ApplicationStatus;
  desiredStart: string;
  desiredEnd: string;
  desiredPrice?: number;
  comment?: string;
  rejectionReason?: string;
  reviewedById?: number;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'active' | 'expired' | 'terminated';
export type EdoStatus = 'not_sent' | 'sent' | 'signed' | 'rejected';

export interface Contract {
  id: number;
  tenantId: number;
  applicationId: number;
  application?: Application;
  clientId: number;
  client?: Client;
  unitId: number;
  unit?: Unit;
  contractNumber: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount?: number;
  paymentDay: number;
  status: ContractStatus;
  docUrl?: string;
  signedPdfUrl?: string;
  edoProvider?: string;
  edoDocumentId?: string;
  edoStatus?: EdoStatus;
  edoSentAt?: string;
  signedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  invoices?: Invoice[];
  createdAt: string;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: number;
  tenantId: number;
  contractId: number;
  contract?: Contract;
  invoiceNumber: string;
  periodStart?: string;
  periodEnd?: string;
  amount: number;
  vatAmount?: number;
  totalAmount: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt?: string;
  paidAmount?: number;
  paymentReference?: string;
  createdAt: string;
}

export interface Payment {
  id: number;
  tenantId: number;
  invoiceId: number;
  invoice?: Invoice;
  provider: string;
  externalId?: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  receiptUrl?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AccessCard {
  id: number;
  tenantId: number;
  clientId: number;
  client?: Client;
  contractId: number;
  contract?: Contract;
  cardNumber: string;
  holderName: string;
  qrToken?: string;
  zones?: string[];
  isActive: boolean;
  blockedReason?: string;
  activatedAt?: string;
  blockedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface AccessCardQrData {
  qrToken: string;
  cardNumber: string;
  holderName: string;
  isActive: boolean;
}

export interface Notification {
  id: number;
  tenantId: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicket {
  id: number;
  tenantId: number;
  userId: number;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  description?: string;
  assignedTo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: number;
  ticketId: number;
  senderType: 'user' | 'admin' | 'system';
  senderId: number;
  message: string;
  attachments?: string[];
  createdAt: string;
}

export interface Document {
  id: number;
  tenantId: number;
  entityType: string;
  entityId: number;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  category: string;
  uploadedBy: number;
  createdAt: string;
}

export interface ContractTemplate {
  id: number;
  tenantId: number;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

export type MaintenanceStatus = 'new' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceRequest {
  id: number;
  tenantId: number;
  unitId: number;
  unit?: Unit;
  title: string;
  description?: string;
  status: MaintenanceStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'cancelled' | 'past_due';

export interface Subscription {
  id: number;
  tenantId: number;
  plan: string;
  priceMonthly: number;
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  status: SubscriptionStatus;
  canceledAt?: string;
  cancelReason?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceMonthly: number;
  features: string[];
  limits: Record<string, number>;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  inn?: string;
  legalAddress?: string;
  contactEmail: string;
  contactPhone?: string;
  plan: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardKpi {
  totalProperties: number;
  totalUnits: number;
  occupancyRate: number;
  monthlyRevenue: number;
  overdueInvoices: number;
  overdueRate: number;
  activeContracts: number;
  pendingApplications: number;
  avgRentPerSqm: number;
}

export interface RevenuePoint {
  month: string;
  revenue: number;
  target?: number;
}

export interface OccupancyPoint {
  propertyId: number;
  propertyName: string;
  occupancyRate: number;
  totalUnits: number;
  rentedUnits: number;
  totalArea: number;
  rentedArea: number;
  areaOccupancy: number;
}

export interface AgedDebt {
  range: string;
  amount: number;
  count: number;
}

export interface CashflowPoint {
  month: string;
  billed: number;
  collected: number;
}

export interface ActivityEvent {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  userId: number;
  user?: { id: number; fullName: string; email: string };
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  createdAt: string;
}

export interface OnboardingProgress {
  stepsCompleted: string[];
  completedSteps: string[];
  totalSteps: number;
  isCompleted: boolean;
  isSkipped?: boolean;
}
