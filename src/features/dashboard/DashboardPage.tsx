import React, { useState, useCallback, useMemo } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Space, List, Avatar, Empty, Progress, Button, theme, Skeleton } from 'antd';
import {
  DollarOutlined,
  WarningOutlined,
  HomeOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  MinusCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardApi, applicationsApi, contractsApi, usersApi, invoicesApi } from '../../api/endpoints';
import { formatMoney, formatDate, timeAgo } from '../../lib/format';
import { APPLICATION_STATUS_MAP, CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { DashboardKpi, RevenuePoint, ActivityEvent, Application, Contract, ApplicationStatus, ContractStatus } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { UserProfile } from '../../types/auth';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAuthStore } from '../../store/auth';

const { Title, Text } = Typography;

/* ── Onboarding Checklist ──────────────────────────────── */

const ONBOARDING_DISMISSED_KEY = 'ngrent_onboarding_dismissed';

interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  link: string;
  check: (ctx: { kpi?: DashboardKpi; user: UserProfile | null; usersCount: number }) => boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: 'requisites',
    title: 'Заполните реквизиты компании',
    description: 'Укажите ИНН и юридические данные организации',
    link: '/settings?tab=requisites',
    check: ({ user }) => {
      // объект tenant из бэкенда может содержать inn, хотя TS-тип его не объявляет
      const tenant = user?.tenant as Record<string, unknown> | undefined;
      return !!tenant?.inn;
    },
  },
  {
    key: 'property',
    title: 'Добавьте первый объект',
    description: 'Создайте объект недвижимости для управления',
    link: '/properties',
    check: ({ kpi }) => (kpi?.totalProperties ?? 0) > 0,
  },
  {
    key: 'units',
    title: 'Создайте помещения',
    description: 'Добавьте помещения в объект для сдачи в аренду',
    link: '/units',
    check: ({ kpi }) => (kpi?.totalUnits ?? 0) > 0,
  },
  {
    key: 'invite',
    title: 'Пригласите сотрудника',
    description: 'Добавьте коллег для совместной работы',
    link: '/settings?tab=users',
    check: ({ usersCount }) => usersCount > 1,
  },
];

const OnboardingChecklist: React.FC<{ kpi?: DashboardKpi }> = ({ kpi }) => {
  const user = useAuthStore((s) => s.user);

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const { data: usersData } = useQuery<PaginatedResponse<UserProfile>>({
    queryKey: ['onboarding-users-check'],
    queryFn: () => usersApi.list({ page: 1, limit: 1 }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const usersCount = usersData?.total ?? 1;

  const ctx = useMemo(
    () => ({ kpi, user, usersCount }),
    [kpi, user, usersCount],
  );

  const completedCount = useMemo(
    () => ONBOARDING_STEPS.filter((s) => s.check(ctx)).length,
    [ctx],
  );

  const allCompleted = completedCount === ONBOARDING_STEPS.length;

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    } catch { /* ignore */ }
    setDismissed(true);
  }, []);

  if (dismissed || allCompleted) return null;

  const percent = Math.round((completedCount / ONBOARDING_STEPS.length) * 100);

  return (
    <Card
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <RocketOutlined style={{ color: '#2563eb' }} />
          <span>Начало работы</span>
        </Space>
      }
      extra={
        <Button type="text" size="small" onClick={handleDismiss}>
          Скрыть
        </Button>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text type="secondary">{completedCount} из {ONBOARDING_STEPS.length} выполнено</Text>
          <Text type="secondary">{percent}%</Text>
        </div>
        <Progress percent={percent} showInfo={false} strokeColor="#2563eb" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ONBOARDING_STEPS.map((step) => {
          const done = step.check(ctx);
          return (
            <Link
              key={step.key}
              to={step.link}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: done ? '#f6ffed' : '#fafafa',
                  border: done ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {done ? (
                  <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a', marginTop: 2 }} />
                ) : (
                  <MinusCircleOutlined style={{ fontSize: 20, color: '#d9d9d9', marginTop: 2 }} />
                )}
                <div>
                  <div style={{ fontWeight: 500, textDecoration: done ? 'line-through' : 'none', color: done ? '#8c8c8c' : 'inherit' }}>
                    {step.title}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{step.description}</Text>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
};

/* ── KPI Card ──────────────────────────────────────────── */

const KpiCard: React.FC<{ title: string; value: string; subtitle?: string; icon: React.ReactNode; color: string }> = ({ title, value, subtitle, icon, color }) => (
  <Card>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <Text type="secondary" style={{ fontSize: 13 }}>{title}</Text>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
        {subtitle && <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text>}
      </div>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 22 }}>
        {icon}
      </div>
    </div>
  </Card>
);

const DashboardPage: React.FC = () => {
  const { token } = theme.useToken();
  usePageTitle('Дашборд');
  const { data: kpi, isLoading: kpiLoading } = useQuery<DashboardKpi>({
    queryKey: ['dashboard-kpi'],
    queryFn: () => dashboardApi.kpi(),
  });

  const { data: revenueData } = useQuery<RevenuePoint[]>({
    queryKey: ['dashboard-revenue'],
    queryFn: () => dashboardApi.revenue(),
  });

  const { data: recentApps } = useQuery<PaginatedResponse<Application>>({
    queryKey: ['dashboard-applications'],
    queryFn: () => applicationsApi.list({ page: 1, limit: 5 }),
  });

  const { data: expiringContracts } = useQuery<Contract[]>({
    queryKey: ['dashboard-expiring'],
    queryFn: () => contractsApi.expiring(30),
  });

  const { data: feed } = useQuery<ActivityEvent[]>({
    queryKey: ['dashboard-feed'],
    queryFn: () => dashboardApi.activity(8),
  });

  const { data: occupancy } = useQuery<any[]>({
    queryKey: ['dashboard-occupancy'],
    queryFn: () => dashboardApi.occupancy(),
  });

  const { data: topDebtors } = useQuery<any[]>({
    queryKey: ['dashboard-top-debtors'],
    queryFn: () => dashboardApi.topDebtors(),
  });

  const { data: recentInvoices } = useQuery<any>({
    queryKey: ['dashboard-recent-invoices'],
    queryFn: () => invoicesApi.list({ limit: 5, status: 'overdue' }),
  });

  if (kpiLoading) {
    return (
      <div style={{ padding: 24 }}>
        <Row gutter={[16, 16]}>
          {[1,2,3,4].map(i => <Col xs={12} sm={6} key={i}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>)}
        </Row>
        <div style={{ marginTop: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
      </div>
    );
  }

  const appColumns = [
    { title: '№', dataIndex: 'id', key: 'id', render: (id: number) => <Link to={`/applications/${id}`}>#{id}</Link> },
    { title: 'Клиент', dataIndex: ['client', 'companyName'], key: 'client' },
    { title: 'Помещение', dataIndex: ['unit', 'unitNumber'], key: 'unit' },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ApplicationStatus) => {
        const m = APPLICATION_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    { title: 'Дата', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
  ];

  const contractColumns = [
    { title: '№', dataIndex: 'contractNumber', key: 'num', render: (n: string, r: Contract) => <Link to={`/contracts/${r.id}`}>{n}</Link> },
    { title: 'Клиент', dataIndex: ['client', 'companyName'], key: 'client' },
    { title: 'Окончание', dataIndex: 'endDate', key: 'end', render: (d: string) => formatDate(d) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ContractStatus) => {
        const m = CONTRACT_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Панель управления</Title>
      <OnboardingChecklist kpi={kpi} />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="Доход за месяц" value={formatMoney(kpi?.monthlyRevenue ?? 0)} subtitle={`Средняя ставка: ${formatMoney(kpi?.avgRentPerSqm ?? 0)}/м²`} icon={<DollarOutlined />} color="#2563eb" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="Просроченные счета" value={String(kpi?.overdueInvoices ?? 0)} subtitle={`Доля: ${kpi?.overdueRate ?? 0}%`} icon={<WarningOutlined />} color="#ff4d4f" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="Заполняемость" value={`${kpi?.occupancyRate ?? 0}%`} subtitle={`${kpi?.totalUnits ?? 0} помещений`} icon={<HomeOutlined />} color="#52c41a" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="Активные договоры" value={String(kpi?.activeContracts ?? 0)} subtitle={`${kpi?.totalProperties ?? 0} объектов`} icon={<FileTextOutlined />} color="#7c3aed" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {(kpi?.overdueInvoices ?? 0) > 0 && (
          <Col xs={24} sm={8}>
            <Link to="/invoices?status=overdue" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderLeft: '4px solid #ff4d4f' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Text type="secondary">Просроченных счетов</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}>{kpi?.overdueInvoices}</div>
                  </div>
                  <Button type="primary" danger size="small">Взыскать →</Button>
                </div>
              </Card>
            </Link>
          </Col>
        )}
        {(kpi?.pendingApplications ?? 0) > 0 && (
          <Col xs={24} sm={8}>
            <Link to="/applications?status=submitted" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderLeft: '4px solid #faad14' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Text type="secondary">Заявок ждут рассмотрения</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#faad14' }}>{kpi?.pendingApplications}</div>
                  </div>
                  <Button type="primary" size="small" style={{ background: '#faad14', borderColor: '#faad14' }}>Рассмотреть →</Button>
                </div>
              </Card>
            </Link>
          </Col>
        )}
        {(expiringContracts?.length ?? 0) > 0 && (
          <Col xs={24} sm={8}>
            <Link to="/contracts?status=active" style={{ textDecoration: 'none' }}>
              <Card hoverable style={{ borderLeft: '4px solid #7c3aed' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Text type="secondary">Договоров истекают за 30 дней</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{expiringContracts?.length}</div>
                  </div>
                  <Button type="primary" size="small" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>Продлить →</Button>
                </div>
              </Card>
            </Link>
          </Col>
        )}
        {(kpi?.overdueInvoices ?? 0) === 0 && (kpi?.pendingApplications ?? 0) === 0 && (expiringContracts?.length ?? 0) === 0 && (
          <Col xs={24}>
            <Card style={{ borderLeft: '4px solid #52c41a', textAlign: 'center', padding: '8px 0' }}>
              <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a', marginRight: 8 }} />
              <Text style={{ color: '#52c41a', fontWeight: 500 }}>Всё в порядке — нет срочных задач</Text>
            </Card>
          </Col>
        )}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card title="Доход по месяцам">
            {(revenueData && revenueData.length > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, (max: number) => max > 0 ? max : 100000]} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных за период. Графики появятся после создания счетов." />
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Последние события" style={{ height: '100%' }}>
            <List
              dataSource={feed || []}
              renderItem={(item: ActivityEvent) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <List.Item.Meta
                    avatar={<Avatar size="small" style={{ background: '#2563eb' }}>{item.user?.fullName?.[0] || '?'}</Avatar>}
                    title={<Text style={{ fontSize: 13 }}>{item.user?.fullName || 'Система'}: {item.action} {item.entityType}</Text>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{timeAgo(item.createdAt)}</Text>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card title="Заполняемость объектов" extra={<Link to="/analytics"><Button type="link" size="small">Подробнее</Button></Link>}>
            {occupancy && occupancy.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {occupancy.slice(0, 5).map((p: any) => (
                  <div key={p.propertyId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: p.propertyName }}>{p.propertyName}</Text>
                      <Text strong style={{ fontSize: 13 }}>{p.occupancyRate}%</Text>
                    </div>
                    <Progress percent={p.occupancyRate} showInfo={false} strokeColor={p.occupancyRate >= 80 ? '#52c41a' : p.occupancyRate >= 50 ? '#faad14' : '#ff4d4f'} size="small" />
                  </div>
                ))}
              </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет объектов" />}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Топ должников" extra={<Link to="/analytics"><Button type="link" size="small">Все</Button></Link>}>
            {topDebtors && topDebtors.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topDebtors.slice(0, 5).map((d: any, i: number) => (
                  <div key={d.clientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 4 ? '1px solid #f0f0f0' : 'none' }}>
                    <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: d.companyName }}>{d.companyName}</Text>
                    <Text strong style={{ color: '#ff4d4f', fontSize: 13, whiteSpace: 'nowrap', marginLeft: 8 }}>{formatMoney(d.total)}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Text type="success" strong>Должников нет</Text>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Просроченные счета" extra={<Link to="/invoices?status=overdue"><Button type="link" size="small">Все</Button></Link>}>
            {recentInvoices?.data && recentInvoices.data.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentInvoices.data.slice(0, 5).map((inv: any, i: number) => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 4 ? '1px solid #f0f0f0' : 'none' }}>
                    <div>
                      <Text style={{ fontSize: 13 }}>{inv.invoiceNumber}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>{formatDate(inv.dueDate)}</Text>
                    </div>
                    <Text strong style={{ color: '#ff4d4f', fontSize: 13, whiteSpace: 'nowrap' }}>{formatMoney(inv.totalAmount)}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Text type="success" strong>Просрочек нет</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Последние заявки" extra={<Link to="/applications"><Button type="link" size="small">Все</Button></Link>}>
            <Table
              columns={appColumns}
              dataSource={recentApps?.data || []}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет заявок." /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Истекающие договоры" extra={<Link to="/contracts"><Button type="link" size="small">Все</Button></Link>}>
            <Table
              columns={contractColumns}
              dataSource={(expiringContracts || []).slice(0, 5)}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет истекающих договоров." /> }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
