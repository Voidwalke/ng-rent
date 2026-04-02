import React, { useState } from 'react';
import { Typography, Tabs, Card, Descriptions, Form, Input, Button, Table, Modal, Select, Switch, Space, Tag, Popconfirm, Radio, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SyncOutlined, ApiOutlined, EditOutlined, CheckOutlined, CloseOutlined, GoogleOutlined, MailOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { authApi, usersApi, subscriptionApi, settingsApi, integration1cApi, complianceApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { ROLE_MAP, PLAN_MAP } from '../../lib/constants';
import { formatMoney } from '../../lib/format';
import type { UserProfile, UserRole, ChangePasswordDto } from '../../types/auth';
import type { Subscription, SubscriptionPlan } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const SettingsPage: React.FC = () => {
  usePageTitle('Настройки');
  const { user, setUser, hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [passwordForm] = Form.useForm();
  const [requisitesForm] = Form.useForm();
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm] = Form.useForm();
  const [webhookModal, setWebhookModal] = useState(false);
  const [webhookForm] = Form.useForm();
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm] = Form.useForm();
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>(() => (localStorage.getItem('ngrent_1c_status') as any) || 'unknown');
  const [apiCheckTime, setApiCheckTime] = useState<string | null>(() => localStorage.getItem('ngrent_1c_time'));
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => localStorage.getItem('ngrent_1c_lastsync'));

  // 2FA state
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [disableModal2fa, setDisableModal2fa] = useState(false);
  const [disableCode2fa, setDisableCode2fa] = useState('');
  const [disablePassword2fa, setDisablePassword2fa] = useState('');
  const [disableMethod, setDisableMethod] = useState<'code' | 'password'>('code');
  const [setupModal2fa, setSetupModal2fa] = useState(false);
  const [setupMethod2fa, setSetupMethod2fa] = useState<'email' | 'totp'>('totp');
  const [totpStep, setTotpStep] = useState<'choose' | 'qr' | 'confirm'>('choose');
  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  // Вкладка профиля
  const updateProfileMutation = useMutation({
    mutationFn: (dto: { fullName?: string; phone?: string }) => authApi.updateProfile(dto),
    onSuccess: async () => {
      const me = await authApi.me();
      setUser(me);
      setProfileEditing(false);
      message.success('Профиль обновлён');
    },
    onError: () => message.error('Ошибка обновления профиля'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (dto: ChangePasswordDto) => authApi.changePassword(dto),
    onSuccess: () => { passwordForm.resetFields(); message.success('Пароль изменён'); },
    onError: () => message.error('Ошибка смены пароля'),
  });

  // Вкладка пользователей
  const { data: usersData, isLoading: usersLoading } = useQuery<PaginatedResponse<UserProfile>>({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ limit: 100 }),
  });

  const inviteMutation = useMutation({
    mutationFn: (v: { email: string; fullName: string; role: string }) => usersApi.invite(v.email, v.fullName, v.role),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setInviteModal(false); inviteForm.resetFields(); message.success('Приглашение отправлено'); },
    onError: () => message.error('Ошибка'),
  });

  // Вкладка подписки
  const { data: subscription } = useQuery<Subscription>({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.current(),
  });

  // Вкладка уведомлений
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => settingsApi.getPreferences(),
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (settings: Record<string, boolean>) => settingsApi.updatePreferences({ settings }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['preferences'] }); message.success('Настройки сохранены'); },
  });

  // Вебхуки
  const { data: webhooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => settingsApi.webhooks(),
  });

  const createWebhookMutation = useMutation({
    mutationFn: (dto: { url: string; events: string[] }) => settingsApi.createWebhook(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setWebhookModal(false); webhookForm.resetFields(); message.success('Webhook создан'); },
    onError: () => message.error('Ошибка'),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: number) => settingsApi.deleteWebhook(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhooks'] }); message.success('Webhook удалён'); },
  });

  // 1C Integration
  const export1cMutation = useMutation({
    mutationFn: () => integration1cApi.export(),
    onSuccess: () => message.success('Экспорт в 1С выполнен'),
    onError: () => message.error('Ошибка экспорта'),
  });



  // Соответствие требованиям
  const { data: consents } = useQuery({
    queryKey: ['compliance-consents'],
    queryFn: () => complianceApi.consents(),
  });

  const consentMutation = useMutation({
    mutationFn: (purpose: string) => complianceApi.recordConsent(purpose),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance-consents'] }); message.success('Согласие зафиксировано'); },
  });

  const dataExportMutation = useMutation({
    mutationFn: () => complianceApi.requestDataExport(),
    onSuccess: () => message.success('Запрос на экспорт данных создан'),
    onError: () => message.error('Ошибка'),
  });

  // Тарифные планы и оплата
  const { data: plans } = useQuery<SubscriptionPlan[]>({
    queryKey: ['plans'],
    queryFn: () => subscriptionApi.plans(),
  });

  const changePlanMutation = useMutation({
    mutationFn: (plan: string) => subscriptionApi.changePlan(plan),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      const r = res as { priceMonthly?: number };
      if (r.priceMonthly && Number(r.priceMonthly) > 0) {
        message.success('Тариф изменён. Нажмите «Оплатить подписку» для активации.');
      } else {
        message.success('Тариф изменён');
      }
    },
    onError: (err: any) => message.error(err?.response?.data?.message || 'Ошибка смены тарифа'),
  });

  const paySubscriptionMutation = useMutation({
    mutationFn: () => subscriptionApi.pay(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      const r = res as { confirmationUrl?: string };
      if (r.confirmationUrl) window.open(r.confirmationUrl, '_blank');
      else message.success('Подписка оплачена');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      if (msg?.includes('не найден')) message.info('Нет неоплаченных счетов');
      else message.error(msg || 'Ошибка оплаты');
    },
  });

  const ROLE_DESCRIPTIONS: Record<string, string> = {
    admin: 'Полный доступ: управление объектами, договорами, финансами и пользователями',
    manager: 'Работа с объектами, договорами и клиентами. Без управления пользователями',
    tenant: 'Портал арендатора: свои договоры, счета и заявки',
  };
  const roleOptions = Object.entries(ROLE_MAP)
    .filter(([k]) => k !== 'super_admin')
    .map(([k, v]) => ({ value: k, label: `${v} — ${ROLE_DESCRIPTIONS[k] || ''}` }));

  const handleToggle2fa = () => {
    if (!user) return;
    if (user.is2faEnabled) { setDisableModal2fa(true); setDisableMethod('code'); setDisableCode2fa(''); setDisablePassword2fa(''); return; }
    setSetupModal2fa(true);
    setTotpStep('choose');
    setSetupMethod2fa('totp');
    setTotpQr('');
    setTotpSecret('');
    setTotpCode('');
    setEmailOtpSent(false);
    setEmailOtpCode('');
  };

  const handleSetupNext2fa = async () => {
    if (setupMethod2fa === 'email') {
      if (!emailOtpSent) {
        setTwoFaLoading(true);
        try { await authApi.enable2fa(); setEmailOtpSent(true); message.success('Код отправлен на email'); }
        catch { message.error('Ошибка отправки кода'); }
        finally { setTwoFaLoading(false); }
        return;
      }
      if (!emailOtpCode || emailOtpCode.length !== 6) { message.warning('Введите 6-значный код из email'); return; }
      setTwoFaLoading(true);
      try { await authApi.enable2fa(emailOtpCode); const me = await authApi.me(); setUser(me); message.success('2FA включена'); setSetupModal2fa(false); setEmailOtpSent(false); setEmailOtpCode(''); }
      catch { message.error('Неверный код'); }
      finally { setTwoFaLoading(false); }
      return;
    }
    if (totpStep === 'choose') {
      setTwoFaLoading(true);
      try { const res = await authApi.enableTotp(); setTotpQr(res.qrCode); setTotpSecret(res.secret); setTotpStep('qr'); }
      catch { message.error('Ошибка генерации QR-кода'); }
      finally { setTwoFaLoading(false); }
    } else if (totpStep === 'qr') {
      setTotpStep('confirm');
    } else if (totpStep === 'confirm') {
      if (!totpCode || totpCode.length !== 6) { message.warning('Введите 6-значный код'); return; }
      setTwoFaLoading(true);
      try { await authApi.confirmTotp(totpCode); const me = await authApi.me(); setUser(me); message.success('Google Authenticator настроен'); setSetupModal2fa(false); }
      catch { message.error('Неверный код'); }
      finally { setTwoFaLoading(false); }
    }
  };

  const handleDisable2fa = async () => {
    const dto: { code?: string; password?: string } = {};
    if (disableMethod === 'code') {
      if (!disableCode2fa) { message.warning('Введите код'); return; }
      dto.code = disableCode2fa;
    } else {
      if (!disablePassword2fa) { message.warning('Введите пароль'); return; }
      dto.password = disablePassword2fa;
    }
    setTwoFaLoading(true);
    try { await authApi.disable2fa(dto); const me = await authApi.me(); setUser(me); message.success('2FA отключена'); setDisableModal2fa(false); setDisableCode2fa(''); setDisablePassword2fa(''); }
    catch { message.error(disableMethod === 'code' ? 'Неверный код' : 'Неверный пароль'); }
    finally { setTwoFaLoading(false); }
  };

  const profileTab = (
    <div>
      <Card
        title="Информация"
        style={{ marginBottom: 16 }}
        extra={
          !profileEditing ? (
            <Button icon={<EditOutlined />} onClick={() => { profileForm.setFieldsValue({ fullName: user?.fullName, phone: user?.phone }); setProfileEditing(true); }}>Редактировать</Button>
          ) : (
            <Space>
              <Button icon={<CheckOutlined />} type="primary" loading={updateProfileMutation.isPending} onClick={() => profileForm.validateFields().then((v) => updateProfileMutation.mutate(v))}>Сохранить</Button>
              <Button icon={<CloseOutlined />} onClick={() => setProfileEditing(false)}>Отмена</Button>
            </Space>
          )
        }
      >
        {profileEditing ? (
          <Form form={profileForm} layout="vertical" style={{ maxWidth: 400 }}>
            <Form.Item name="fullName" label="ФИО" rules={[{ required: true, message: 'Введите ФИО' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Телефон">
              <Input placeholder="+7 (999) 123-45-67" />
            </Form.Item>
          </Form>
        ) : (
          <Descriptions column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="ФИО">{user?.fullName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{user?.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="Телефон">{user?.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Роль">{ROLE_MAP[user?.role as UserRole] || user?.role}</Descriptions.Item>
            <Descriptions.Item label="Компания">{user?.tenant?.name || user?.tenantName || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>
      <Card title="Двухфакторная аутентификация" style={{ marginTop: 16 }}>
        <Space>
          <Text>2FA {user?.is2faEnabled ? 'включена' : 'отключена'}</Text>
          <Switch checked={user?.is2faEnabled} loading={twoFaLoading} onChange={handleToggle2fa} />
        </Space>
      </Card>
      <Card title="Изменить пароль" style={{ marginTop: 16 }}>
        <Form form={passwordForm} layout="vertical" onFinish={(v: ChangePasswordDto) => changePasswordMutation.mutate(v)} style={{ maxWidth: 400 }}>
          <Form.Item name="currentPassword" label="Текущий пароль" rules={[{ required: true, message: 'Обязательно' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true, message: 'Обязательно' }, { min: 8, message: 'Минимум 8 символов' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={changePasswordMutation.isPending}>Сменить пароль</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );

  const usersTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { inviteForm.resetFields(); setInviteModal(true); }}>Пригласить</Button>
      </div>
      <Table
        columns={[
          { title: 'ФИО', dataIndex: 'fullName', key: 'name' },
          { title: 'Email', dataIndex: 'email', key: 'email' },
          { title: 'Роль', dataIndex: 'role', key: 'role', render: (r: UserRole) => ROLE_MAP[r] || r },
          { title: '2FA', dataIndex: 'is2faEnabled', key: '2fa', render: (v: boolean) => v ? 'Да' : 'Нет' },
        ]}
        dataSource={usersData?.data || []}
        rowKey="id"
        loading={usersLoading}
        pagination={false}
      />
    </div>
  );

  const LIMIT_LABELS: Record<string, string> = { users: 'Пользователей', properties: 'Объектов', units: 'Помещений' };
  const formatLimit = (v: number) => v < 0 ? 'Безлимитно' : String(v);
  const currentPlan = subscription?.plan || user?.tenantPlan || 'free';

  const subscriptionTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Текущая подписка">
        <Descriptions column={1}>
          <Descriptions.Item label="Тариф">{PLAN_MAP[currentPlan as keyof typeof PLAN_MAP] || currentPlan}</Descriptions.Item>
          <Descriptions.Item label="Статус"><Tag color={subscription?.status === 'active' ? 'green' : 'default'}>{subscription?.status === 'active' ? 'Активна' : subscription?.status || '—'}</Tag></Descriptions.Item>
          <Descriptions.Item label="Стоимость">{subscription?.priceMonthly ? formatMoney(subscription.priceMonthly) + '/мес' : 'Бесплатно'}</Descriptions.Item>
        </Descriptions>
        {subscription?.priceMonthly ? (
          <Button type="primary" onClick={() => paySubscriptionMutation.mutate()} loading={paySubscriptionMutation.isPending} style={{ marginTop: 12 }}>Оплатить подписку</Button>
        ) : null}
      </Card>
      {plans && plans.length > 0 && (
        <Card title="Доступные тарифы">
          <Table size="small" pagination={false} rowKey={(r: any) => r.id || r.plan || r.code} dataSource={plans} columns={[
            { title: 'Тариф', key: 'name', render: (_: unknown, r: any) => <Text strong>{r.name || PLAN_MAP[r.plan as keyof typeof PLAN_MAP] || r.plan}</Text> },
            { title: 'Цена', key: 'price', render: (_: unknown, r: any) => r.priceMonthly ? formatMoney(r.priceMonthly) + '/мес' : 'Бесплатно' },
            { title: 'Лимиты', key: 'limits', render: (_: unknown, r: any) => {
              const limits = r.limits || {};
              return Object.entries(limits).map(([k, v]) => `${LIMIT_LABELS[k] || k}: ${formatLimit(v as number)}`).join(', ') || '—';
            }},
            {
              title: '', key: 'action',
              render: (_: unknown, r: any) => {
                const planCode = r.id || r.plan || r.code;
                return planCode !== currentPlan ? (
                  <Button size="small" type="primary" onClick={() => changePlanMutation.mutate(planCode)} loading={changePlanMutation.isPending}>Выбрать</Button>
                ) : <Tag color="green">Текущий</Tag>;
              },
            },
          ]} />
        </Card>
      )}
    </Space>
  );

  const prefsData = (prefs as Record<string, unknown>)?.settings as Record<string, boolean> | undefined;
  const getPref = (key: string, fallback = true) => prefsData?.[key] ?? fallback;
  const setPref = (key: string, val: boolean) => updatePrefsMutation.mutate({ ...prefsData, [key]: val });

  const notificationsTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Каналы уведомлений">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 420 }}>
            <Text>Email-уведомления</Text>
            <Switch checked={getPref('email', true)} onChange={(v) => setPref('email', v)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 420 }}>
            <Text>Push-уведомления</Text>
            <Switch checked={getPref('push', false)} onChange={(v) => setPref('push', v)} />
          </div>
        </Space>
      </Card>
      <Card title="Типы уведомлений">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 420 }}>
            <Text>Напоминания об оплате счетов</Text>
            <Switch checked={getPref('invoiceReminder', true)} onChange={(v) => setPref('invoiceReminder', v)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 420 }}>
            <Text>Истечение срока договоров</Text>
            <Switch checked={getPref('contractExpiry', true)} onChange={(v) => setPref('contractExpiry', v)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 420 }}>
            <Text>Обновления по обслуживанию</Text>
            <Switch checked={getPref('maintenanceUpdates', true)} onChange={(v) => setPref('maintenanceUpdates', v)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 420 }}>
            <Text>Подтверждения платежей</Text>
            <Switch checked={getPref('paymentConfirmation', true)} onChange={(v) => setPref('paymentConfirmation', v)} />
          </div>
        </Space>
      </Card>
    </Space>
  );

  const webhookList = Array.isArray(webhooks) ? webhooks : [];

  const webhooksTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { webhookForm.resetFields(); setWebhookModal(true); }}>Добавить webhook</Button>
      </div>
      <Table size="small" pagination={false} rowKey="id" dataSource={webhookList as { id: number; url: string; events: string[]; isActive: boolean }[]} columns={[
        { title: 'URL', dataIndex: 'url', key: 'url' },
        { title: 'События', dataIndex: 'events', key: 'events', render: (e: string[]) => (e || []).map((ev) => <Tag key={ev}>{ev}</Tag>) },
        { title: 'Статус', dataIndex: 'isActive', key: 'active', render: (v: boolean) => v ? <Tag color="green">Активен</Tag> : <Tag>Отключён</Tag> },
        {
          title: '', key: 'action',
          render: (_: unknown, r: { id: number }) => (
            <Popconfirm title="Удалить webhook?" onConfirm={() => deleteWebhookMutation.mutate(r.id)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          ),
        },
      ]} />
    </div>
  );

  const EXCEL_TYPE_LABELS: Record<string, string> = { invoices: 'Счета', contracts: 'Договоры', acts: 'Акты' };

  const downloadExcel1c = async (type: 'invoices' | 'contracts' | 'acts', mode: 'landlord' | 'tenant' = 'landlord') => {
    try {
      const { default: apiClient } = await import('../../api/client');
      // landlord = данные как арендодатель (все счета/договоры/акты компании)
      // tenant = данные как арендатор (только свои, по client-записям)
      const url = mode === 'landlord'
        ? `/integration/1c/export/${type}/excel`
        : `/my/export/${type}/excel`;
      const prefix = mode === 'landlord' ? 'landlord' : 'tenant';
      const response = await apiClient.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = `${prefix}-${type}-1c-export.xlsx`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl); }, 500);
      message.success(`${EXCEL_TYPE_LABELS[type] || type} выгружены в Excel`);
    } catch { message.error('Ошибка экспорта'); }
  };

  const integration1cTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Сдача в аренду — экспорт для 1С" extra={<Tag color="blue">Вы — арендодатель</Tag>}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Все счета, договоры и акты вашей компании как арендодателя — по всем арендаторам
        </Text>
        <Space wrap>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel1c('invoices', 'landlord')}>Счета (Excel)</Button>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel1c('contracts', 'landlord')}>Договоры (Excel)</Button>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel1c('acts', 'landlord')}>Акты (Excel)</Button>
        </Space>
      </Card>
      <Card title="Аренда у других — экспорт для 1С" extra={<Tag color="orange">Вы — арендатор</Tag>}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Ваши счета, договоры и акты как арендатора — по помещениям, которые вы арендуете у других компаний
        </Text>
        <Space wrap>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel1c('invoices', 'tenant')}>Счета (Excel)</Button>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel1c('contracts', 'tenant')}>Договоры (Excel)</Button>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel1c('acts', 'tenant')}>Акты (Excel)</Button>
        </Space>
      </Card>
      <Card title="API-интеграция с 1С">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Статус API">
            <Tag color={apiStatus === 'ok' ? 'green' : apiStatus === 'error' ? 'red' : 'default'}>
              {apiStatus === 'ok' ? 'Подключено' : apiStatus === 'error' ? 'Нет связи' : 'Не проверено'}
            </Tag>
            {apiCheckTime && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>проверено {apiCheckTime}</Text>}
          </Descriptions.Item>
          {lastSyncAt && (
            <Descriptions.Item label="Последняя синхронизация">
              {new Date(lastSyncAt).toLocaleString('ru-RU')}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Режим">
            <Tag color="blue">API (двусторонний обмен)</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Данные">
            Объекты, помещения, контрагенты, счета, договоры, оплаты
          </Descriptions.Item>
          <Descriptions.Item label="API-адрес">
            <Text copyable={{ text: `${window.location.origin.replace('5173','3000')}/api/v1` }} style={{ fontSize: 12 }}>
              {window.location.origin.replace('5173','3000')}/api/v1
            </Text>
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <Space wrap>
            <Button icon={<ApiOutlined />} onClick={() => {
              setApiStatus('unknown');
              integration1cApi.health().then((data: any) => {
                const time = new Date().toLocaleTimeString('ru-RU');
                const status = data?.status === 'connected' ? 'ok' : 'error';
                setApiStatus(status as any);
                setApiCheckTime(time);
                if (data?.lastSyncAt) setLastSyncAt(data.lastSyncAt);
                localStorage.setItem('ngrent_1c_status', status);
                localStorage.setItem('ngrent_1c_time', time);
                if (data?.lastSyncAt) localStorage.setItem('ngrent_1c_lastsync', data.lastSyncAt);
              }).catch(() => {
                const time = new Date().toLocaleTimeString('ru-RU');
                setApiStatus('error');
                setApiCheckTime(time);
                localStorage.setItem('ngrent_1c_status', 'error');
                localStorage.setItem('ngrent_1c_time', time);
              });
            }}>Проверить подключение</Button>
            <Button type="primary" icon={<SyncOutlined />} onClick={() => export1cMutation.mutate()} loading={export1cMutation.isPending}>Выгрузить в 1С</Button>
            <Button icon={<SyncOutlined />} onClick={() => {
              message.info('Для загрузки данных из 1С нажмите «Выгрузить в NGRent» в обработке 1С:Предприятия');
            }}>Загрузить из 1С</Button>
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            Откройте обработку «Обмен NGRent» в 1С. «Загрузить» — данные из NGRent в 1С. «Выгрузить в NGRent» — данные из 1С обратно.
          </Text>
        </div>
      </Card>
    </Space>
  );

  const PURPOSE_MAP: Record<string, string> = {
    data_processing: 'Обработка персональных данных',
    marketing: 'Маркетинговые рассылки',
    analytics: 'Аналитика и статистика',
  };

  const revokeMutation = useMutation({
    mutationFn: (id: number) => complianceApi.revokeConsent(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance-consents'] }); message.success('Согласие отозвано'); },
    onError: () => message.error('Ошибка отзыва'),
  });

  const consentsList = Array.isArray(consents) ? consents : [];
  const givenTypes = new Set(consentsList.map((c: any) => c.type));

  const complianceTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Согласия на обработку ПД (152-ФЗ)">
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          В соответствии с Федеральным законом №152-ФЗ «О персональных данных» необходимо зафиксировать согласие на обработку ПД.
        </Text>
        <Table size="small" pagination={false} rowKey="id" dataSource={consentsList} columns={[
          { title: 'Цель', key: 'purpose', render: (_: unknown, r: any) => PURPOSE_MAP[r.type] || r.type || '—' },
          { title: 'Дата', key: 'date', render: (_: unknown, r: any) => r.acceptedAt ? new Date(r.acceptedAt).toLocaleDateString('ru-RU') : '—' },
          { title: 'Статус', key: 'status', render: () => <Tag color="green">Активно</Tag> },
          { title: '', key: 'action', width: 120, render: (_: unknown, r: any) => (
            <Popconfirm title="Отозвать согласие?" okText="Да" cancelText="Нет" onConfirm={() => revokeMutation.mutate(r.id)}>
              <Button size="small" danger>Отозвать</Button>
            </Popconfirm>
          )},
        ]}
        locale={{ emptyText: 'Согласия не зафиксированы. Нажмите кнопку ниже.' }}
        />
        <Space style={{ marginTop: 12 }} wrap>
          <Button type="primary" onClick={() => consentMutation.mutate('data_processing')} loading={consentMutation.isPending} disabled={givenTypes.has('data_processing')}>
            {givenTypes.has('data_processing') ? 'ПД — дано' : 'Согласие на обработку ПД'}
          </Button>
          <Button onClick={() => consentMutation.mutate('marketing')} loading={consentMutation.isPending} disabled={givenTypes.has('marketing')}>
            {givenTypes.has('marketing') ? 'Рассылки — дано' : 'Согласие на рассылки'}
          </Button>
          <Button onClick={() => consentMutation.mutate('analytics')} loading={consentMutation.isPending} disabled={givenTypes.has('analytics')}>
            {givenTypes.has('analytics') ? 'Аналитика — дано' : 'Согласие на аналитику'}
          </Button>
        </Space>
      </Card>
      <Card title="Экспорт персональных данных">
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Вы можете запросить экспорт всех персональных данных, хранящихся в системе, в соответствии со ст. 14 152-ФЗ.
        </Text>
        <Button icon={<ApiOutlined />} onClick={() => dataExportMutation.mutate()} loading={dataExportMutation.isPending}>Запросить экспорт данных</Button>
      </Card>
      <Card title="Удаление аккаунта">
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Вы можете запросить полное удаление вашего аккаунта и всех связанных данных в соответствии со ст. 21 152-ФЗ. Удаление произойдёт в течение 30 дней.
        </Text>
        <Popconfirm title="Вы уверены? Это действие нельзя отменить." okText="Да, удалить" cancelText="Отмена" onConfirm={() => { complianceApi.deleteAccount().then(() => message.success('Запрос на удаление принят')).catch(() => message.error('Ошибка')); }}>
          <Button danger>Запросить удаление аккаунта</Button>
        </Popconfirm>
      </Card>
    </Space>
  );

  const { data: tenantData } = useQuery({
    queryKey: ['tenant-requisites'],
    queryFn: () => authApi.me(),
  });

  React.useEffect(() => {
    if (tenantData?.tenant) {
      requisitesForm.setFieldsValue(tenantData.tenant);
    }
  }, [tenantData, requisitesForm]);

  const isAdmin = hasRole('admin', 'super_admin');

  const requisitesTab = (
    <Card title="Реквизиты организации (для договоров и счетов)">
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Эти данные используются при генерации договоров, счетов, актов и счетов-фактур</Text>
      {!isAdmin && <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Реквизиты может редактировать только администратор</Text>}
      <Form form={requisitesForm} layout="vertical" style={{ maxWidth: 600 }}
        disabled={!isAdmin}
        onFinish={async (v) => {
          try {
            const { default: api } = await import('../../api/client');
            await api.patch('/auth/tenant', v);
            queryClient.invalidateQueries({ queryKey: ['tenant-requisites'] });
            message.success('Реквизиты сохранены');
          } catch { message.error('Ошибка сохранения'); }
        }}
      >
        <Form.Item name="name" label="Наименование организации"><Input /></Form.Item>
        <Form.Item name="inn" label="ИНН"><Input maxLength={12} /></Form.Item>
        <Form.Item name="kpp" label="КПП"><Input maxLength={9} /></Form.Item>
        <Form.Item name="ogrn" label="ОГРН"><Input maxLength={15} /></Form.Item>
        <Form.Item name="legalAddress" label="Юридический адрес"><Input /></Form.Item>
        <Form.Item name="bankName" label="Наименование банка"><Input /></Form.Item>
        <Form.Item name="bankAccount" label="Расчётный счёт"><Input maxLength={20} /></Form.Item>
        <Form.Item name="corrAccount" label="Корреспондентский счёт"><Input maxLength={20} /></Form.Item>
        <Form.Item name="bik" label="БИК"><Input maxLength={9} /></Form.Item>
        <Form.Item name="vatRate" label="Ставка НДС (%)">
          <Select>
            <Select.Option value={20}>20% (ОСНО)</Select.Option>
            <Select.Option value={0}>0% (УСН, без НДС)</Select.Option>
          </Select>
        </Form.Item>
        {isAdmin && (
          <Form.Item>
            <Button type="primary" htmlType="submit">Сохранить реквизиты</Button>
          </Form.Item>
        )}
      </Form>
    </Card>
  );

  const auditTab = (
    <Card>
      <Text>Журнал событий доступен на отдельной странице.</Text>
      <br /><br />
      <Link to="/audit"><Button type="primary">Перейти в журнал</Button></Link>
    </Card>
  );

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Настройки</Title>
      <Tabs items={[
        { key: 'profile', label: 'Профиль', children: profileTab },
        { key: 'requisites', label: 'Реквизиты', children: requisitesTab },
        ...(hasRole('admin', 'super_admin') ? [
          { key: 'users', label: 'Пользователи', children: usersTab },
          { key: 'subscription', label: 'Подписка', children: subscriptionTab },
        ] : []),
        { key: 'notifications', label: 'Уведомления', children: notificationsTab },
        ...(hasRole('admin', 'super_admin') ? [
          { key: 'webhooks', label: 'Webhooks', children: webhooksTab },
          { key: '1c', label: 'Интеграция 1С', children: integration1cTab },
        ] : []),
        { key: 'compliance', label: '152-ФЗ', children: complianceTab },
        ...(hasRole('admin', 'super_admin') ? [
          { key: 'audit', label: 'Аудит', children: auditTab },
        ] : []),
      ]} />

      {/* Модалка настройки 2FA */}
      <Modal
        title={totpStep === 'choose' ? 'Включить 2FA' : totpStep === 'qr' ? 'Сканируйте QR-код' : 'Подтвердите настройку'}
        open={setupModal2fa}
        onCancel={() => { setSetupModal2fa(false); setTotpCode(''); setEmailOtpSent(false); setEmailOtpCode(''); }}
        onOk={handleSetupNext2fa}
        okText={totpStep === 'choose' && setupMethod2fa === 'email' && !emailOtpSent ? 'Отправить код' : totpStep === 'choose' && setupMethod2fa === 'email' && emailOtpSent ? 'Подтвердить' : totpStep === 'confirm' ? 'Подтвердить' : 'Далее'}
        cancelText="Отмена"
        confirmLoading={twoFaLoading}
        width={window.innerWidth < 500 ? '95%' : 480}
      >
        {totpStep === 'choose' && !emailOtpSent && (
          <div>
            <Text style={{ display: 'block', marginBottom: 16 }}>Выберите способ получения кодов:</Text>
            <Radio.Group value={setupMethod2fa} onChange={(e) => setSetupMethod2fa(e.target.value)} style={{ width: '100%' }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Radio value="totp" style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, width: '100%' }}>
                  <Space><GoogleOutlined style={{ fontSize: 20, color: '#4285f4' }} /><div><Text strong>Google Authenticator</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>Коды генерируются в приложении</Text></div></Space>
                </Radio>
                <Radio value="email" style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, width: '100%' }}>
                  <Space><MailOutlined style={{ fontSize: 20, color: '#52c41a' }} /><div><Text strong>Email</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>Код отправляется на {user?.email}</Text></div></Space>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        )}
        {totpStep === 'choose' && emailOtpSent && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ display: 'block', marginBottom: 16 }}>Введите 6-значный код, отправленный на {user?.email}:</Text>
            <Input placeholder="000000" value={emailOtpCode} onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))} maxLength={6} size="large" style={{ width: 200, textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
          </div>
        )}
        {totpStep === 'qr' && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ display: 'block', marginBottom: 16 }}>Откройте Google Authenticator и отсканируйте QR-код:</Text>
            {totpQr && <img src={totpQr} alt="QR Code" style={{ width: 200, height: 200, margin: '0 auto 16px' }} />}
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Или введите ключ вручную:</Text>
            <Text code copyable style={{ fontSize: 14 }}>{totpSecret}</Text>
          </div>
        )}
        {totpStep === 'confirm' && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ display: 'block', marginBottom: 16 }}>Введите 6-значный код из Google Authenticator:</Text>
            <Input placeholder="000000" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} maxLength={6} size="large" style={{ width: 200, textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
          </div>
        )}
      </Modal>

      {/* Модалка отключения 2FA */}
      <Modal title="Отключение 2FA" open={disableModal2fa} onCancel={() => { setDisableModal2fa(false); setDisableCode2fa(''); setDisablePassword2fa(''); }} onOk={handleDisable2fa} okText="Отключить" cancelText="Отмена" confirmLoading={twoFaLoading}>
        <Radio.Group value={disableMethod} onChange={(e) => setDisableMethod(e.target.value)} style={{ marginBottom: 16 }}>
          <Radio value="code">Код подтверждения</Radio>
          <Radio value="password">Пароль от аккаунта</Radio>
        </Radio.Group>
        {disableMethod === 'code' ? (
          <>
            <Text style={{ display: 'block', marginBottom: 12 }}>Введите код из Google Authenticator или email:</Text>
            <Input placeholder="000000" value={disableCode2fa} onChange={(e) => setDisableCode2fa(e.target.value.replace(/\D/g, ''))} maxLength={6} size="large" style={{ width: 200, textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
          </>
        ) : (
          <>
            <Text style={{ display: 'block', marginBottom: 12 }}>Введите пароль от вашего аккаунта:</Text>
            <Input.Password placeholder="Пароль" value={disablePassword2fa} onChange={(e) => setDisablePassword2fa(e.target.value)} size="large" />
          </>
        )}
      </Modal>

      <Modal title="Пригласить пользователя" open={inviteModal} onOk={() => inviteForm.validateFields().then((v) => inviteMutation.mutate(v))} onCancel={() => setInviteModal(false)} confirmLoading={inviteMutation.isPending} okText="Пригласить" cancelText="Отмена">
        <Form form={inviteForm} layout="vertical">
          <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Некорректный email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="fullName" label="ФИО" rules={[{ required: true, message: 'Введите ФИО' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Роль" rules={[{ required: true, message: 'Выберите роль' }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Новый webhook" open={webhookModal} onOk={() => webhookForm.validateFields().then((v) => createWebhookMutation.mutate(v))} onCancel={() => setWebhookModal(false)} confirmLoading={createWebhookMutation.isPending} okText="Создать" cancelText="Отмена">
        <Form form={webhookForm} layout="vertical">
          <Form.Item name="url" label="URL" rules={[{ required: true, message: 'Введите URL' }, { type: 'url', message: 'Некорректный URL' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="events" label="События" rules={[{ required: true, message: 'Выберите события' }]}>
            <Select mode="multiple" placeholder="Выберите события" options={[
              { value: 'invoice.created', label: 'Создание счёта' },
              { value: 'invoice.paid', label: 'Оплата счёта' },
              { value: 'contract.signed', label: 'Подписание договора' },
              { value: 'application.approved', label: 'Одобрение заявки' },
              { value: 'payment.succeeded', label: 'Успешный платёж' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
