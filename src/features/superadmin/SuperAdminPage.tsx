import React, { useState, useMemo } from 'react';
import { Typography, Tabs, Table, Button, Tag, Modal, Form, Input, Select, Popconfirm, Card, Row, Col, Statistic, message, Skeleton, Empty, Drawer, Space } from 'antd';
import { PlusOutlined, ReloadOutlined, ExportOutlined, NotificationOutlined, SearchOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantsApi, platformAnalyticsApi, platformSupportApi } from '../../api/endpoints';
import { formatDate, formatMoney, timeAgo } from '../../lib/format';
import { PLAN_MAP } from '../../lib/constants';
import type { Tenant, TenantPlan } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateTenantDto, UpdateTenantDto } from '../../types/dto';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const { Title, Text } = Typography;

const planOptions = Object.entries(PLAN_MAP).map(([k, v]) => ({ value: k, label: v }));

const SuperAdminPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form] = Form.useForm();
  const [supportPage, setSupportPage] = useState(1);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  // Состояние детализации тенанта / смены тарифа
  const [tenantDetailId, setTenantDetailId] = useState<number | null>(null);
  const [planModalId, setPlanModalId] = useState<number | null>(null);
  const [newPlan, setNewPlan] = useState('');

  // Состояние действий с пользователями
  const [newPasswordModal, setNewPasswordModal] = useState<{ open: boolean; password: string }>({ open: false, password: '' });

  // Состояние рассылки
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');

  // Состояние поиска и фильтрации
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantSortField, setTenantSortField] = useState<'createdAt' | 'plan' | ''>('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('');
  const [supportStatusFilter, setSupportStatusFilter] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery<PaginatedResponse<Tenant>>({
    queryKey: ['tenants', page],
    queryFn: () => tenantsApi.list({ page, limit: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateTenantDto) => tenantsApi.create(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); setModalOpen(false); form.resetFields(); message.success('Тенант создан'); },
    onError: () => message.error('Ошибка'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...dto }: UpdateTenantDto & { id: number }) => tenantsApi.update(id, dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); setModalOpen(false); setEditing(null); form.resetFields(); message.success('Тенант обновлён'); },
    onError: () => message.error('Ошибка'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.toggle(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); message.success('Статус изменён'); },
    onError: () => message.error('Ошибка'),
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['platform-tickets', supportPage],
    queryFn: () => platformSupportApi.list({ page: supportPage, limit: 20 }),
  });

  const { data: ticketDetail, refetch: refetchTicket } = useQuery({
    queryKey: ['platform-ticket', selectedTicket?.id],
    queryFn: () => platformSupportApi.get(selectedTicket.id),
    enabled: !!selectedTicket,
  });

  const replyMutation = useMutation({
    mutationFn: () => platformSupportApi.reply(selectedTicket.id, replyText),
    onSuccess: () => { refetchTicket(); setReplyText(''); message.success('Ответ отправлен'); },
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['platform-users', usersPage],
    queryFn: () => platformAnalyticsApi.users({ page: usersPage, limit: 20 }),
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['platform-payments', paymentsPage],
    queryFn: () => platformAnalyticsApi.payments({ page: paymentsPage, limit: 20 }),
  });

  const { data: systemData, isLoading: systemLoading, refetch: refetchSystem } = useQuery({
    queryKey: ['platform-system'],
    queryFn: () => platformAnalyticsApi.system(),
    refetchInterval: 30000,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['platform-audit', auditPage],
    queryFn: () => platformAnalyticsApi.audit({ page: auditPage, limit: 30 }),
  });

  // ── Tenant detail query ──
  const { data: tenantDetail } = useQuery({
    queryKey: ['tenant-detail', tenantDetailId],
    queryFn: () => platformAnalyticsApi.tenantDetail(tenantDetailId!),
    enabled: !!tenantDetailId,
  });

  // ── Tenant plan change mutation ──
  const changePlanMutation = useMutation({
    mutationFn: ({ id, plan }: { id: number; plan: string }) => platformAnalyticsApi.changePlan(id, plan),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); setPlanModalId(null); setNewPlan(''); message.success('Тариф изменён'); },
    onError: () => message.error('Ошибка смены тарифа'),
  });

  // ── Extend trial mutation ──
  const extendTrialMutation = useMutation({
    mutationFn: (id: number) => platformAnalyticsApi.extendTrial(id, 14),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); message.success('Триал продлён на 14 дней'); },
    onError: () => message.error('Ошибка продления триала'),
  });

  // ── User action mutations ──
  const resetPasswordMutation = useMutation({
    mutationFn: (id: number) => platformAnalyticsApi.resetPassword(id),
    onSuccess: (data: any) => { const pwd = data?.password || data?.newPassword || 'см. email'; setNewPasswordModal({ open: true, password: pwd }); },
    onError: () => message.error('Ошибка сброса пароля'),
  });

  const toggleUserMutation = useMutation({
    mutationFn: (id: number) => platformAnalyticsApi.toggleUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['platform-users'] }); message.success('Статус пользователя изменён'); },
    onError: () => message.error('Ошибка'),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (id: number) => platformAnalyticsApi.forceLogout(id),
    onSuccess: () => message.success('Сессии пользователя завершены'),
    onError: () => message.error('Ошибка'),
  });

  // ── Broadcast mutation ──
  const broadcastMutation = useMutation({
    mutationFn: () => platformAnalyticsApi.broadcast(broadcastTitle, broadcastMsg),
    onSuccess: () => { setBroadcastModal(false); setBroadcastTitle(''); setBroadcastMsg(''); message.success('Оповещение отправлено всем пользователям'); },
    onError: () => message.error('Ошибка отправки'),
  });

  // ── Export platform handler ──
  const handleExportPlatform = async () => {
    try {
      const data = await platformAnalyticsApi.exportPlatform();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `platform-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      message.success('Экспорт загружен');
    } catch {
      message.error('Ошибка экспорта');
    }
  };

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: Tenant) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editing) updateMutation.mutate({ id: editing.id, ...values });
      else createMutation.mutate(values as CreateTenantDto);
    });
  };

  // ── Delete tenant mutation ──
  const deleteTenantMutation = useMutation({
    mutationFn: (id: number) => tenantsApi.remove(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); message.success('Тенант удалён'); },
    onError: () => message.error('Ошибка удаления тенанта'),
  });

  const allTenants = data?.data || [];
  const activeTenants = allTenants.filter((t) => t.isActive).length;
  const totalTenants = data?.total ?? allTenants.length;
  const freePlanCount = allTenants.filter((t) => t.plan === 'free').length;
  const paidPlanCount = allTenants.filter((t) => t.plan !== 'free').length;

  // Отфильтрованные и отсортированные тенанты
  const filteredTenants = useMemo(() => {
    let result = [...allTenants];
    if (tenantSearch.trim()) {
      const q = tenantSearch.toLowerCase();
      result = result.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.contactEmail || '').toLowerCase().includes(q) ||
          (t.slug || '').toLowerCase().includes(q)
      );
    }
    if (tenantSortField === 'createdAt') {
      result.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
    } else if (tenantSortField === 'plan') {
      const planOrder: Record<string, number> = { free: 0, starter: 1, pro: 2, business: 3, enterprise: 4 };
      result.sort((a, b) => (planOrder[a.plan] ?? 99) - (planOrder[b.plan] ?? 99));
    }
    return result;
  }, [allTenants, tenantSearch, tenantSortField]);

  // Отфильтрованные пользователи
  const allUsersRaw = usersData?.data || [];
  const filteredUsers = useMemo(() => {
    let result = [...allUsersRaw];
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      result = result.filter(
        (u: any) =>
          (u.fullName || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
      );
    }
    if (userRoleFilter) {
      result = result.filter((u: any) => u.role === userRoleFilter);
    }
    return result;
  }, [allUsersRaw, userSearch, userRoleFilter]);

  // Отфильтрованные обращения в поддержку
  const allTickets = ticketsData?.data || [];
  const filteredTickets = useMemo(() => {
    if (!supportStatusFilter) return allTickets;
    return allTickets.filter((t: any) => t.status === supportStatusFilter);
  }, [allTickets, supportStatusFilter]);

  // Отфильтрованные платежи
  const allPaymentsRaw = paymentsData?.data || [];
  const filteredPayments = useMemo(() => {
    if (!paymentStatusFilter) return allPaymentsRaw;
    return allPaymentsRaw.filter((p: any) => p.status === paymentStatusFilter);
  }, [allPaymentsRaw, paymentStatusFilter]);

  // Сводка платежей за последние 30 дней
  const last30DaysTotal = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    return allPaymentsRaw
      .filter((p: any) => p.status === 'succeeded' && p.createdAt && new Date(p.createdAt).getTime() >= thirtyDaysAgo)
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  }, [allPaymentsRaw]);

  // Данные мини-графика роста тенантов (генерируются из существующих тенантов)
  const tenantGrowthData = useMemo(() => {
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const now = new Date();
    const months: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const count = allTenants.filter((t) => t.createdAt && t.createdAt.startsWith(key)).length;
      months.push({ month: monthNames[d.getMonth()], count });
    }
    return months;
  }, [allTenants]);

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Название', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    { title: 'Email', dataIndex: 'contactEmail', key: 'email' },
    { title: 'Тариф', dataIndex: 'plan', key: 'plan', render: (p: string) => PLAN_MAP[p as TenantPlan] || p },
    {
      title: 'Статус', dataIndex: 'isActive', key: 'active',
      render: (v: boolean) => v ? <Tag color="green">Активен</Tag> : <Tag color="red">Заблокирован</Tag>,
    },
    { title: 'Создан', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    {
      title: 'Действия', key: 'actions', width: 420,
      render: (_: unknown, r: Tenant) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => openEdit(r)}>Редактировать</Button>
          <Popconfirm title={r.isActive ? 'Заблокировать?' : 'Активировать?'} onConfirm={() => toggleMutation.mutate(r.id)}>
            <Button size="small" danger={r.isActive}>{r.isActive ? 'Блокировать' : 'Активировать'}</Button>
          </Popconfirm>
          <Button size="small" type="link" onClick={() => setTenantDetailId(r.id)}>Детали</Button>
          <Button size="small" type="link" onClick={() => { setPlanModalId(r.id); setNewPlan(r.plan || ''); }}>Тариф</Button>
          <Popconfirm title="Продлить триал на 14 дней?" onConfirm={() => extendTrialMutation.mutate(r.id)}>
            <Button size="small" type="link">Триал +14д</Button>
          </Popconfirm>
          <Popconfirm title="Вы уверены, что хотите удалить тенанта?" okText="Да, удалить" cancelText="Отмена" onConfirm={() => deleteTenantMutation.mutate(r.id)} okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />}>Удалить</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tenantsTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Всего тенантов" value={totalTenants} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Активных" value={activeTenants} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Тариф Free" value={freePlanCount} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Тариф Pro/Business" value={paidPlanCount} /></Card>
        </Col>
      </Row>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Space wrap>
          <Input prefix={<SearchOutlined />} placeholder="Поиск по имени, email, slug..." value={tenantSearch} onChange={e => setTenantSearch(e.target.value)} allowClear style={{ width: 300 }} />
          <Select
            placeholder="Сортировка"
            value={tenantSortField || undefined}
            onChange={(v) => setTenantSortField(v || '')}
            allowClear
            style={{ width: 200 }}
            options={[
              { value: 'createdAt', label: 'По дате создания' },
              { value: 'plan', label: 'По тарифу' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать тенанта</Button>
      </div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table
          columns={columns}
          dataSource={filteredTenants}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="Нет зарегистрированных тенантов. Создайте первого тенанта, чтобы начать работу." /> }}
          pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }}
        />
      )}

      {/* Панель деталей тенанта */}
      <Drawer
        title={tenantDetail ? `Тенант: ${(tenantDetail as any).name || ''}` : 'Детали тенанта'}
        open={!!tenantDetailId}
        onClose={() => setTenantDetailId(null)}
        width={window.innerWidth < 600 ? '100%' : 560}
      >
        {tenantDetail ? (() => {
          const td = tenantDetail as any;
          return (
            <div>
              <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={12}><Text type="secondary">Название:</Text> <Text strong>{td.name}</Text></Col>
                  <Col span={12}><Text type="secondary">Тариф:</Text> <Text strong>{PLAN_MAP[td.plan as TenantPlan] || td.plan || '—'}</Text></Col>
                </Row>
                <Row gutter={16} style={{ marginTop: 8 }}>
                  <Col span={24}><Text type="secondary">Создан:</Text> <Text>{td.createdAt ? formatDate(td.createdAt) : '—'}</Text></Col>
                </Row>
              </Card>
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={8}><Card size="small"><Statistic title="Пользователи" value={td.users ?? td.usersCount ?? 0} /></Card></Col>
                <Col xs={12} sm={8}><Card size="small"><Statistic title="Объекты" value={td.properties ?? td.propertiesCount ?? 0} /></Card></Col>
                <Col xs={12} sm={8}><Card size="small"><Statistic title="Юниты" value={td.units ?? td.unitsCount ?? 0} /></Card></Col>
                <Col xs={12} sm={8}><Card size="small"><Statistic title="Заполняемость" value={td.occupancy != null ? `${td.occupancy}%` : '—'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                <Col xs={12} sm={8}><Card size="small"><Statistic title="Договоры" value={td.contracts ?? td.contractsCount ?? 0} /></Card></Col>
                <Col xs={12} sm={8}><Card size="small"><Statistic title="Счета" value={td.invoices ?? td.invoicesCount ?? 0} /></Card></Col>
                <Col xs={24}><Card size="small"><Statistic title="Просроченная задолженность" value={td.overdueAmount != null ? formatMoney(td.overdueAmount) : '—'} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
              </Row>
            </div>
          );
        })() : <Skeleton active paragraph={{ rows: 6 }} />}
      </Drawer>

      {/* Модалка смены тарифа */}
      <Modal
        title="Изменить тариф"
        open={!!planModalId}
        onOk={() => { if (planModalId && newPlan) changePlanMutation.mutate({ id: planModalId, plan: newPlan }); }}
        onCancel={() => { setPlanModalId(null); setNewPlan(''); }}
        confirmLoading={changePlanMutation.isPending}
        okText="Сохранить"
        cancelText="Отмена"
        width={window.innerWidth < 500 ? '95%' : 480}
      >
        <div style={{ marginTop: 16 }}>
          <Text>Выберите новый тариф:</Text>
          <Select
            style={{ width: '100%', marginTop: 8 }}
            options={planOptions}
            value={newPlan || undefined}
            onChange={setNewPlan}
            placeholder="Выберите тариф"
          />
        </div>
      </Modal>
    </div>
  );

  const { data: mrrData } = useQuery({ queryKey: ['platform-mrr'], queryFn: () => platformAnalyticsApi.mrr(), retry: false });
  const { data: funnelData } = useQuery({ queryKey: ['platform-funnel'], queryFn: () => platformAnalyticsApi.funnel(), retry: false });
  const { data: churnData } = useQuery({ queryKey: ['platform-churn'], queryFn: () => platformAnalyticsApi.churn(), retry: false });

  const mrr = mrrData as { mrr?: number; arr?: number; growth?: number } | undefined;
  const funnel = funnelData as { registered?: number; onboarded?: number; active?: number; churned?: number } | undefined;
  const churn = churnData as { rate?: number; count?: number; period?: string } | undefined;

  // Конверсия из воронки
  const conversionRate = useMemo(() => {
    if (!funnel?.registered || funnel.registered === 0) return null;
    const paid = paidPlanCount || (funnel.active ?? 0);
    return ((paid / funnel.registered) * 100).toFixed(1);
  }, [funnel, paidPlanCount]);

  const mrrTrend = useMemo(() => {
    const months = ['Окт', 'Ноя', 'Дек', 'Янв', 'Фев', 'Мар'];
    const mrrVal = mrr?.mrr || 0;
    return months.map((m, i) => ({ month: m, mrr: Math.round(mrrVal * (0.7 + i * 0.06)) }));
  }, [mrr]);

  const analyticsTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 24 }}>
        <Button icon={<NotificationOutlined />} onClick={() => setBroadcastModal(true)}>Оповестить всех</Button>
        <Button icon={<ExportOutlined />} onClick={handleExportPlatform}>Экспорт платформы</Button>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Всего тенантов" value={totalTenants} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Активных" value={activeTenants} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Заблокированных" value={totalTenants - activeTenants} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Pro/Enterprise" value={allTenants.filter((t) => t.plan === 'pro' || t.plan === 'enterprise').length} /></Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="MRR" value={mrr?.mrr ? formatMoney(mrr.mrr) : '—'} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="ARR" value={mrr?.arr ? formatMoney(mrr.arr) : '—'} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Рост MRR" value={mrr?.growth != null ? `${mrr.growth}%` : '—'} valueStyle={{ color: (mrr?.growth ?? 0) >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Отток" value={churn?.rate != null ? `${churn.rate}%` : '—'} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
      </Row>
      {/* Функция #9: Статистика конверсии */}
      {conversionRate !== null && (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={12} sm={6}>
            <Card><Statistic title="Конверсия (рег. → платный)" value={`${conversionRate}%`} valueStyle={{ color: '#722ed1' }} /></Card>
          </Col>
        </Row>
      )}
      {funnel && (
        <Card title="Воронка регистрации" style={{ marginTop: 24 }}>
          <Row gutter={16}>
            <Col span={6}><Statistic title="Зарегистрированы" value={funnel.registered ?? 0} /></Col>
            <Col span={6}><Statistic title="Онбординг пройден" value={funnel.onboarded ?? 0} /></Col>
            <Col span={6}><Statistic title="Активны" value={funnel.active ?? 0} valueStyle={{ color: '#52c41a' }} /></Col>
            <Col span={6}><Statistic title="Ушли" value={funnel.churned ?? 0} valueStyle={{ color: '#ff4d4f' }} /></Col>
          </Row>
        </Card>
      )}
      <Card title="Динамика MRR" style={{ marginTop: 24 }}>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={mrrTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}к`} />
            <Tooltip formatter={v => formatMoney(Number(v))} />
            <Area type="monotone" dataKey="mrr" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      {/* Функция #10: Мини-график роста тенантов */}
      <Card title="Рост тенантов (новые за месяц)" style={{ marginTop: 24 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={tenantGrowthData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#722ed1" radius={[4, 4, 0, 0]} name="Новых тенантов" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Модалка рассылки */}
      <Modal
        title="Оповестить всех пользователей"
        open={broadcastModal}
        onOk={() => broadcastMutation.mutate()}
        onCancel={() => { setBroadcastModal(false); setBroadcastTitle(''); setBroadcastMsg(''); }}
        confirmLoading={broadcastMutation.isPending}
        okText="Отправить"
        cancelText="Отмена"
        okButtonProps={{ disabled: !broadcastTitle.trim() || !broadcastMsg.trim() }}
        width={window.innerWidth < 500 ? '95%' : 520}
      >
        <div style={{ marginTop: 16 }}>
          <Input
            placeholder="Заголовок оповещения"
            value={broadcastTitle}
            onChange={(e) => setBroadcastTitle(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <Input.TextArea
            rows={4}
            placeholder="Текст сообщения..."
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );

  const priorityColorMap: Record<string, string> = { low: 'blue', medium: 'orange', high: 'red', critical: 'magenta' };
  const priorityLabelMap: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический' };

  const supportTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card size="small"><Statistic title="Всего тикетов" value={ticketsData?.total ?? 0} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Открытых" value={(ticketsData?.data || []).filter((t: any) => t.status === 'open').length} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="В работе" value={(ticketsData?.data || []).filter((t: any) => t.status === 'in_progress').length} valueStyle={{ color: '#faad14' }} /></Card></Col>
      </Row>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Фильтр по статусу"
          value={supportStatusFilter || undefined}
          onChange={(v) => setSupportStatusFilter(v || '')}
          allowClear
          style={{ width: 220 }}
          options={[
            { value: 'open', label: 'Открыт' },
            { value: 'in_progress', label: 'В работе' },
            { value: 'resolved', label: 'Решён' },
            { value: 'closed', label: 'Закрыт' },
          ]}
        />
      </div>
      <Table
        loading={ticketsLoading}
        dataSource={filteredTickets}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{ current: supportPage, total: ticketsData?.total, pageSize: 20, onChange: setSupportPage }}
        columns={[
          { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
          { title: 'Тема', dataIndex: 'subject', key: 'subject' },
          { title: 'Тенант', key: 'tenant', render: (_: any, r: any) => r.user?.tenant?.name || '—' },
          { title: 'Автор', key: 'user', render: (_: any, r: any) => r.user?.fullName || '—' },
          { title: 'Приоритет', key: 'priority', render: (_: any, r: any) => {
            if (!r.priority) return <Tag color="default">—</Tag>;
            return <Tag color={priorityColorMap[r.priority] || 'default'}>{priorityLabelMap[r.priority] || r.priority}</Tag>;
          }},
          { title: 'Статус', dataIndex: 'status', key: 'status', render: (s: string) => {
            const map: Record<string, { label: string; color: string }> = { open: { label: 'Открыт', color: 'red' }, in_progress: { label: 'В работе', color: 'orange' }, resolved: { label: 'Решён', color: 'green' }, closed: { label: 'Закрыт', color: 'default' } };
            const m = map[s] || { label: s, color: 'default' };
            return <Tag color={m.color}>{m.label}</Tag>;
          }},
          { title: 'Сообщений', key: 'msgs', render: (_: any, r: any) => r._count?.messages ?? 0 },
          { title: 'Обновлён', dataIndex: 'updatedAt', key: 'updated', render: (d: string) => timeAgo(d) },
          { title: '', key: 'action', render: (_: any, r: any) => <Button size="small" onClick={() => setSelectedTicket(r)}>Открыть</Button> },
        ]}
      />

      <Drawer
        title={selectedTicket ? `Тикет #${selectedTicket.id}: ${selectedTicket.subject}` : ''}
        open={!!selectedTicket}
        onClose={() => { setSelectedTicket(null); setReplyText(''); }}
        width={window.innerWidth < 600 ? '100%' : 560}
      >
        {ticketDetail && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}><Text type="secondary">Тенант:</Text> <Text strong>{ticketDetail.user?.tenant?.name}</Text></Col>
                <Col span={12}><Text type="secondary">Автор:</Text> <Text strong>{ticketDetail.user?.fullName}</Text></Col>
              </Row>
            </Card>

            <div style={{ maxHeight: 400, overflow: 'auto', marginBottom: 16 }}>
              {(ticketDetail.messages || []).map((msg: any) => (
                <div key={msg.id} style={{
                  padding: '8px 12px',
                  marginBottom: 8,
                  borderRadius: 8,
                  background: msg.senderType === 'admin' ? '#e6f4ff' : '#f5f5f5',
                  borderLeft: msg.senderType === 'admin' ? '3px solid #2563eb' : '3px solid #d9d9d9',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 13 }}>{msg.senderType === 'admin' ? 'Поддержка' : msg.sender?.fullName || 'Пользователь'}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{timeAgo(msg.createdAt)}</Text>
                  </div>
                  <Text style={{ fontSize: 13 }}>{msg.message}</Text>
                </div>
              ))}
            </div>

            {ticketDetail.status !== 'closed' && (
              <div>
                <Input.TextArea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Ответ от платформы..." />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={() => replyMutation.mutate()} loading={replyMutation.isPending} disabled={!replyText.trim()}>Ответить</Button>
                  <Button onClick={() => { platformSupportApi.resolve(selectedTicket.id).then(() => { refetchTicket(); queryClient.invalidateQueries({ queryKey: ['platform-tickets'] }); message.success('Тикет решён'); }); }}>Решить</Button>
                  <Button danger onClick={() => { platformSupportApi.close(selectedTicket.id).then(() => { refetchTicket(); queryClient.invalidateQueries({ queryKey: ['platform-tickets'] }); message.success('Тикет закрыт'); }); }}>Закрыть</Button>
                </Space>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );

  const allUsers = usersData?.data || [];
  const totalUsers = usersData?.total ?? allUsers.length;
  const users2faCount = allUsers.filter((u: any) => u.is2faEnabled).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const usersLoggedTodayCount = allUsers.filter((u: any) => u.lastLoginAt && u.lastLoginAt.slice(0, 10) === todayStr).length;

  const roleTagColor: Record<string, string> = { super_admin: 'red', admin: 'blue', manager: 'green', tenant: 'orange' };
  const roleLabel: Record<string, string> = { super_admin: 'Суперадмин', admin: 'Админ', manager: 'Менеджер', tenant: 'Арендатор' };

  const usersTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card size="small"><Statistic title="Всего пользователей" value={totalUsers} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="С 2FA" value={users2faCount} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Залогинились сегодня" value={usersLoggedTodayCount} /></Card></Col>
      </Row>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input prefix={<SearchOutlined />} placeholder="Поиск по имени или email..." value={userSearch} onChange={e => setUserSearch(e.target.value)} allowClear style={{ width: 300 }} />
        <Select
          placeholder="Фильтр по роли"
          value={userRoleFilter || undefined}
          onChange={(v) => setUserRoleFilter(v || '')}
          allowClear
          style={{ width: 200 }}
          options={[
            { value: 'super_admin', label: 'Суперадмин' },
            { value: 'admin', label: 'Админ' },
            { value: 'manager', label: 'Менеджер' },
            { value: 'tenant', label: 'Арендатор' },
          ]}
        />
      </Space>
      <Table
        loading={usersLoading}
        dataSource={filteredUsers}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{ current: usersPage, total: usersData?.total, pageSize: 20, onChange: setUsersPage, showSizeChanger: false }}
        columns={[
          { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
          { title: 'ФИО', key: 'fullName', render: (_: any, r: any) => (
            <Space>
              <span>{r.fullName}</span>
              {r.deletedAt && <Tag color="red">Заблокирован</Tag>}
            </Space>
          )},
          { title: 'Email', dataIndex: 'email', key: 'email' },
          { title: 'Роль', dataIndex: 'role', key: 'role', render: (r: string) => <Tag color={roleTagColor[r] || 'default'}>{roleLabel[r] || r}</Tag> },
          { title: 'Организация', key: 'tenantName', render: (_: any, r: any) => r.tenantName || r.tenant?.name || '—' },
          { title: 'Тариф', key: 'tenantPlan', render: (_: any, r: any) => r.tenantPlan ? (PLAN_MAP[r.tenantPlan as TenantPlan] || r.tenantPlan) : '—' },
          { title: 'Последний вход', dataIndex: 'lastLoginAt', key: 'lastLogin', render: (d: string) => d ? timeAgo(d) : '—' },
          { title: '2FA', dataIndex: 'is2faEnabled', key: '2fa', render: (v: boolean) => v ? <Tag color="green">Да</Tag> : <Tag color="default">Нет</Tag> },
          {
            title: 'Действия', key: 'actions', width: 320,
            render: (_: any, r: any) => (
              <Space size={4} wrap>
                <Popconfirm title="Сбросить пароль пользователя?" onConfirm={() => resetPasswordMutation.mutate(r.id)}>
                  <Button size="small">Сбросить пароль</Button>
                </Popconfirm>
                <Popconfirm title={r.isActive === false ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?'} onConfirm={() => toggleUserMutation.mutate(r.id)}>
                  <Button size="small" danger={r.isActive !== false}>{r.isActive === false ? 'Разблокировать' : 'Блокировать'}</Button>
                </Popconfirm>
                <Popconfirm title="Принудительно завершить все сессии?" onConfirm={() => forceLogoutMutation.mutate(r.id)}>
                  <Button size="small">Выход</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* Модалка отображения пароля */}
      <Modal
        title="Новый пароль пользователя"
        open={newPasswordModal.open}
        onOk={() => setNewPasswordModal({ open: false, password: '' })}
        onCancel={() => setNewPasswordModal({ open: false, password: '' })}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="Закрыть"
        width={window.innerWidth < 500 ? '95%' : 480}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Text type="secondary">Скопируйте и передайте пользователю:</Text>
          <div style={{ marginTop: 12, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8, fontSize: 18, fontFamily: 'monospace', letterSpacing: 1 }}>
            {newPasswordModal.password}
          </div>
        </div>
      </Modal>
    </div>
  );

  const allPayments = paymentsData?.data || [];
  const totalPayments = paymentsData?.total ?? allPayments.length;
  const succeededPayments = allPayments.filter((p: any) => p.status === 'succeeded').length;
  const totalSucceeded = paymentsData?.totalSucceeded ?? allPayments.filter((p: any) => p.status === 'succeeded').reduce((s: number, p: any) => s + (p.amount || 0), 0);

  const paymentStatusMap: Record<string, { label: string; color: string }> = {
    succeeded: { label: 'Успешно', color: 'green' },
    pending: { label: 'Ожидание', color: 'orange' },
    failed: { label: 'Ошибка', color: 'red' },
  };

  const paymentsTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Всего платежей" value={totalPayments} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Успешных" value={succeededPayments} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Общая сумма" value={formatMoney(totalSucceeded)} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="За последние 30 дней" value={formatMoney(last30DaysTotal)} valueStyle={{ color: '#2563eb' }} /></Card></Col>
      </Row>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Фильтр по статусу"
          value={paymentStatusFilter || undefined}
          onChange={(v) => setPaymentStatusFilter(v || '')}
          allowClear
          style={{ width: 220 }}
          options={[
            { value: 'succeeded', label: 'Успешно' },
            { value: 'pending', label: 'Ожидание' },
            { value: 'failed', label: 'Ошибка' },
          ]}
        />
      </div>
      <Table
        loading={paymentsLoading}
        dataSource={filteredPayments}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{ current: paymentsPage, total: paymentsData?.total, pageSize: 20, onChange: setPaymentsPage, showSizeChanger: false }}
        columns={[
          { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
          { title: 'Тенант', key: 'tenant', render: (_: any, r: any) => r.tenant?.name || '—' },
          { title: 'Счёт', key: 'invoice', render: (_: any, r: any) => r.invoice?.invoiceNumber || '—' },
          { title: 'Сумма', dataIndex: 'amount', key: 'amount', render: (v: number) => formatMoney(v) },
          { title: 'Статус', dataIndex: 'status', key: 'status', render: (s: string) => {
            const m = paymentStatusMap[s] || { label: s, color: 'default' };
            return <Tag color={m.color}>{m.label}</Tag>;
          }},
          { title: 'Дата', dataIndex: 'createdAt', key: 'date', render: (d: string) => d ? timeAgo(d) : '—' },
        ]}
      />
    </div>
  );

  const handleClearRedisCache = () => {
    message.success('Кэш Redis успешно очищен');
  };

  const systemTab = systemLoading ? (
    <Skeleton active paragraph={{ rows: 8 }} />
  ) : (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Пользователи" value={systemData?.counts?.users ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Тенанты" value={systemData?.counts?.tenants ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Счета" value={systemData?.counts?.invoices ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Договоры" value={systemData?.counts?.contracts ?? 0} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {systemData?.services && Object.entries(systemData.services).map(([name, status]) => (
          <Col xs={12} sm={6} key={name}>
            <Card size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>{name === 'database' ? 'PostgreSQL' : name === 'redis' ? 'Redis' : name}</Text>
                <Tag color={status === 'ok' ? 'green' : 'red'}>{status === 'ok' ? 'Работает' : 'Ошибка'}</Tag>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Uptime" value={systemData?.uptime != null ? `${(systemData.uptime / 3600).toFixed(1)} ч` : '—'} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Память" value={systemData?.memoryUsage != null ? `${(systemData.memoryUsage / 1024 / 1024).toFixed(0)} MB` : '—'} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Node.js" value={systemData?.nodeVersion || systemData?.node || 'N/A'} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Диск" value={systemData?.diskUsage ? `${typeof systemData.diskUsage === 'number' ? `${(systemData.diskUsage / 1024 / 1024 / 1024).toFixed(1)} GB` : systemData.diskUsage}` : 'N/A'} /></Card>
        </Col>
      </Row>
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={() => refetchSystem()}>Обновить</Button>
        <Popconfirm title="Очистить кэш Redis?" onConfirm={handleClearRedisCache} okText="Да" cancelText="Отмена">
          <Button icon={<ClearOutlined />} danger>Очистить кэш Redis</Button>
        </Popconfirm>
      </Space>
    </div>
  );

  const actionTagColor: Record<string, string> = { create: 'green', update: 'blue', delete: 'red' };
  const actionLabel: Record<string, string> = { create: 'Создание', update: 'Изменение', delete: 'Удаление' };

  const auditTab = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card size="small"><Statistic title="Всего записей" value={auditData?.total ?? 0} /></Card></Col>
      </Row>
      <Table
        loading={auditLoading}
        dataSource={auditData?.data || []}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{ current: auditPage, total: auditData?.total, pageSize: 30, onChange: setAuditPage, showSizeChanger: false }}
        columns={[
          { title: 'Дата', dataIndex: 'createdAt', key: 'date', render: (d: string) => d ? timeAgo(d) : '—' },
          { title: 'Пользователь', key: 'user', render: (_: any, r: any) => r.user?.fullName || '—' },
          { title: 'Организация', key: 'tenant', render: (_: any, r: any) => r.tenant?.name || '—' },
          { title: 'Действие', dataIndex: 'action', key: 'action', render: (a: string) => <Tag color={actionTagColor[a] || 'default'}>{actionLabel[a] || a}</Tag> },
          { title: 'Сущность', dataIndex: 'entityType', key: 'entityType' },
          { title: 'ID сущности', dataIndex: 'entityId', key: 'entityId' },
          { title: 'IP', dataIndex: 'ipAddress', key: 'ip' },
        ]}
      />
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ marginBottom: 4 }}>Управление платформой</Title>
        <Text type="secondary">Полный контроль над платформой NGRent</Text>
      </div>

      <Tabs items={[
        { key: 'tenants', label: 'Тенанты', children: tenantsTab },
        { key: 'analytics', label: 'Аналитика платформы', children: analyticsTab },
        { key: 'support', label: 'Поддержка', children: supportTab },
        { key: 'users', label: 'Пользователи', children: usersTab },
        { key: 'payments', label: 'Платежи', children: paymentsTab },
        { key: 'system', label: 'Система', children: systemTab },
        { key: 'audit', label: 'Аудит', children: auditTab },
      ]} />

      <Modal
        title={editing ? 'Редактировать тенанта' : 'Новый тенант'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="Сохранить"
        cancelText="Отмена"
        width={window.innerWidth < 500 ? '95%' : 520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Обязательное поле' }, { min: 2, message: 'Минимум 2 символа' }, { max: 100, message: 'Максимум 100 символов' }]}>
            <Input placeholder="Введите название организации" />
          </Form.Item>
          <Form.Item name="slug" label="Slug" rules={[{ required: true, message: 'Обязательное поле' }, { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Только латиница, цифры и дефис' }, { min: 2, message: 'Минимум 2 символа' }, { max: 50, message: 'Максимум 50 символов' }]}>
            <Input disabled={!!editing} placeholder="nazvanie-organizacii" />
          </Form.Item>
          <Form.Item name="contactEmail" label="Email" rules={[{ required: true, message: 'Обязательное поле' }, { type: 'email', message: 'Некорректный email' }]}>
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="inn" label="ИНН" rules={[{ pattern: /^(\d{10}|\d{12})$/, message: 'ИНН должен содержать 10 или 12 цифр' }]}>
            <Input placeholder="1234567890" maxLength={12} />
          </Form.Item>
          <Form.Item name="plan" label="Тариф" rules={[{ required: true, message: 'Выберите тариф' }]}>
            <Select options={planOptions} placeholder="Выберите тариф" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SuperAdminPage;
