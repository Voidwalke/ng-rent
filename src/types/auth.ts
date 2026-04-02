export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  companyName: string;
  slug: string;
  email: string;
  password: string;
  fullName: string;
  inn?: string;
  acceptTerms: boolean;
}

export interface VerifyOtpDto {
  tempToken: string;
  code: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface AcceptInviteDto {
  token: string;
  fullName: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface TwoFaRequiredResponse {
  requires2fa: true;
  tempToken: string;
  totpEnabled?: boolean;
}

export type LoginResponse = AuthResponse | TwoFaRequiredResponse;

export interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  tenantId?: number;
  tenantName?: string;
  tenantSlug?: string;
  tenantPlan?: TenantPlan;
  is2faEnabled?: boolean;
  emailVerified?: boolean;
  lastLoginAt?: string;
  tenant?: {
    id: number;
    name: string;
    slug: string;
    plan: TenantPlan;
  };
}

/** Normalize backend user (nested tenant) into flat fields */
export function normalizeUser(raw: unknown): UserProfile {
  const src = raw as UserProfile;
  return {
    ...src,
    tenantId: src.tenantId ?? src.tenant?.id,
    tenantName: src.tenantName ?? src.tenant?.name,
    tenantSlug: src.tenantSlug ?? src.tenant?.slug,
    tenantPlan: src.tenantPlan ?? src.tenant?.plan,
  };
}

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'tenant';
export type TenantPlan = 'free' | 'basic' | 'pro' | 'enterprise';

export interface Session {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  current: boolean;
}
