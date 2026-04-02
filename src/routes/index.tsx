import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Spin, theme } from 'antd';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../store/auth';
import AuthLayout from '../components/layout/AuthLayout';
import AppLayout from '../components/layout/AppLayout';
import TenantLayout from '../components/layout/TenantLayout';

const Loader = (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
    <Spin size="large" />
  </div>
);

// Auth
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const TwoFaPage = lazy(() => import('../features/auth/TwoFaPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const AcceptInvitePage = lazy(() => import('../features/auth/AcceptInvitePage'));

// Admin/Manager
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const PropertiesPage = lazy(() => import('../features/properties/PropertiesPage'));
const PropertyDetailPage = lazy(() => import('../features/properties/PropertyDetailPage'));
const UnitsPage = lazy(() => import('../features/units/UnitsPage'));
const UnitDetailPage = lazy(() => import('../features/units/UnitDetailPage'));
const ClientsPage = lazy(() => import('../features/clients/ClientsPage'));
const ApplicationsPage = lazy(() => import('../features/applications/ApplicationsPage'));
const ApplicationDetailPage = lazy(() => import('../features/applications/ApplicationDetailPage'));
const ContractsPage = lazy(() => import('../features/contracts/ContractsPage'));
const ContractDetailPage = lazy(() => import('../features/contracts/ContractDetailPage'));
const InvoicesPage = lazy(() => import('../features/invoices/InvoicesPage'));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage'));
const AccessCardsPage = lazy(() => import('../features/access-control/AccessCardsPage'));
const MaintenancePage = lazy(() => import('../features/maintenance/MaintenancePage'));
const SupportPage = lazy(() => import('../features/support/SupportPage'));
const SupportTicketPage = lazy(() => import('../features/support/SupportTicketPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const AuditPage = lazy(() => import('../features/settings/AuditPage'));
const HelpPage = lazy(() => import('../features/help/HelpPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const ImportPage = lazy(() => import('../features/import/ImportPage'));
const SuperAdminPage = lazy(() => import('../features/superadmin/SuperAdminPage'));

// Tenant Portal
const TenantDashboard = lazy(() => import('../features/tenant-portal/TenantDashboard'));
const TenantApplications = lazy(() => import('../features/tenant-portal/TenantApplications'));
const TenantApplicationDetail = lazy(() => import('../features/tenant-portal/TenantApplicationDetail'));
const TenantContracts = lazy(() => import('../features/tenant-portal/TenantContracts'));
const TenantContractDetail = lazy(() => import('../features/tenant-portal/TenantContractDetail'));
const TenantInvoices = lazy(() => import('../features/tenant-portal/TenantInvoices'));
const TenantDocuments = lazy(() => import('../features/tenant-portal/TenantDocuments'));
const TenantProfile = lazy(() => import('../features/tenant-portal/TenantProfile'));
const TenantUnits = lazy(() => import('../features/tenant-portal/TenantUnits'));
const TenantAccessCards = lazy(() => import('../features/tenant-portal/TenantAccessCards'));
const TenantRentedUnits = lazy(() => import('../features/tenant-portal/TenantRentedUnits'));
const TenantSettings = lazy(() => import('../features/tenant-portal/TenantSettings'));
const TenantMaintenance = lazy(() => import('../features/tenant-portal/TenantMaintenance'));

// Public
const LandingPage = lazy(() => import('../features/auth/LandingPage'));
const CatalogPage = lazy(() => import('../features/catalog/CatalogPage'));
const CatalogDetailPage = lazy(() => import('../features/catalog/CatalogDetailPage'));

// Legal
const TermsPage = lazy(() => import('../features/legal/TermsPage'));
const PrivacyPage = lazy(() => import('../features/legal/PrivacyPage'));

// Errors
const NotFoundPage = lazy(() => import('../features/errors/NotFoundPage'));

const ForbiddenPage = () => {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, color: '#ff4d4f' }}>403</h1>
        <p style={{ fontSize: 18, color: token.colorTextSecondary }}>Нет доступа к этой странице</p>
        <a href="/dashboard">Вернуться на главную</a>
      </div>
    </div>
  );
};

const wrap = (el: React.ReactNode) => (
  <Suspense fallback={Loader}>
    <div className="page-enter">{el}</div>
  </Suspense>
);

export const router = createBrowserRouter([
  // Public
  { path: '/', element: wrap(<LandingPage />) },
  { path: '/catalog', element: wrap(<CatalogPage />) },
  { path: '/catalog/:id', element: wrap(<CatalogDetailPage />) },
  { path: '/terms', element: wrap(<TermsPage />) },
  { path: '/privacy', element: wrap(<PrivacyPage />) },

  // Auth
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: wrap(<LoginPage />) },
      { path: '/register', element: wrap(<RegisterPage />) },
      { path: '/2fa', element: wrap(<TwoFaPage />) },
      { path: '/forgot-password', element: wrap(<ForgotPasswordPage />) },
      { path: '/reset-password', element: wrap(<ResetPasswordPage />) },
      { path: '/accept-invite', element: wrap(<AcceptInvitePage />) },
    ],
  },

  // Admin / Manager panel
  {
    element: (
      <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      // Все роли
      { path: '/dashboard', element: wrap(<DashboardPage />) },
      { path: '/contracts', element: wrap(<ContractsPage />) },
      { path: '/contracts/:id', element: wrap(<ContractDetailPage />) },
      { path: '/invoices', element: wrap(<InvoicesPage />) },
      { path: '/analytics', element: wrap(<AnalyticsPage />) },
      { path: '/support', element: wrap(<SupportPage />) },
      { path: '/support/:id', element: wrap(<SupportTicketPage />) },
      { path: '/settings', element: wrap(<SettingsPage />) },
      // Manager+ only
      { path: '/properties', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<PropertiesPage />)}</ProtectedRoute> },
      { path: '/properties/:id', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<PropertyDetailPage />)}</ProtectedRoute> },
      { path: '/units', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<UnitsPage />)}</ProtectedRoute> },
      { path: '/units/:id', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<UnitDetailPage />)}</ProtectedRoute> },
      { path: '/clients', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<ClientsPage />)}</ProtectedRoute> },
      { path: '/applications', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<ApplicationsPage />)}</ProtectedRoute> },
      { path: '/applications/:id', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<ApplicationDetailPage />)}</ProtectedRoute> },
      { path: '/access-cards', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<AccessCardsPage />)}</ProtectedRoute> },
      { path: '/maintenance', element: <ProtectedRoute roles={['super_admin', 'admin', 'manager']}>{wrap(<MaintenancePage />)}</ProtectedRoute> },
      // Admin only
      { path: '/audit', element: <ProtectedRoute roles={['super_admin', 'admin']}>{wrap(<AuditPage />)}</ProtectedRoute> },
      { path: '/import', element: <ProtectedRoute roles={['super_admin', 'admin']}>{wrap(<ImportPage />)}</ProtectedRoute> },
      { path: '/help', element: wrap(<HelpPage />) },
      { path: '/notifications', element: wrap(<NotificationsPage />) },
      { path: '/profile', element: <Navigate to="/settings" replace /> },
      {
        path: '/superadmin',
        element: (
          <ProtectedRoute roles={['super_admin']}>
            {wrap(<SuperAdminPage />)}
          </ProtectedRoute>
        ),
      },
    ],
  },

  // Tenant portal
  {
    element: (
      <ProtectedRoute>
        <TenantLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/my', element: wrap(<TenantDashboard />) },
      { path: '/my/applications', element: wrap(<TenantApplications />) },
      { path: '/my/applications/:id', element: wrap(<TenantApplicationDetail />) },
      { path: '/my/contracts', element: wrap(<TenantContracts />) },
      { path: '/my/contracts/:id', element: wrap(<TenantContractDetail />) },
      { path: '/my/invoices', element: wrap(<TenantInvoices />) },
      { path: '/my/documents', element: wrap(<TenantDocuments />) },
      { path: '/my/units', element: wrap(<TenantUnits />) },
      { path: '/my/tickets', element: wrap(<SupportPage />) },
      { path: '/my/tickets/:id', element: wrap(<SupportTicketPage />) },
      { path: '/my/access-cards', element: wrap(<TenantAccessCards />) },
      { path: '/my/rented', element: wrap(<TenantRentedUnits />) },
      { path: '/my/settings', element: wrap(<TenantSettings />) },
      { path: '/my/maintenance', element: wrap(<TenantMaintenance />) },
      { path: '/my/help', element: wrap(<HelpPage />) },
      { path: '/my/profile', element: wrap(<TenantProfile />) },
      { path: '/my/notifications', element: wrap(<NotificationsPage />) },
    ],
  },

  // Payment callback → redirect based on role
  {
    path: '/payments/callback',
    element: (() => {
      const PaymentCallback = () => {
        const { user } = useAuthStore();
        const target = user?.role === 'tenant' ? '/my/invoices' : '/invoices';
        return <Navigate to={target} replace />;
      };
      return <PaymentCallback />;
    })(),
  },

  // 403 Forbidden
  {
    path: '/403',
    element: <ForbiddenPage />,
  },

  // 404
  { path: '*', element: wrap(<NotFoundPage />) },
]);
