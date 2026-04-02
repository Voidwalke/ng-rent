import React, { useState } from 'react';
import { Typography, Tabs, Card, Descriptions, Form, Input, Button, Switch, Select, Space, Tag, Table, Popconfirm, Modal, Radio, message } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, ApiOutlined, SyncOutlined, GoogleOutlined, MailOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, settingsApi, complianceApi, integration1cApi, tenantPortalApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import type { ChangePasswordDto } from '../../types/auth';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const PURPOSE_MAP: Record<string, string> = {
  data_processing: 'Обработка персональных данных',
  marketing: 'Маркетинговые рассылки',
  analytics: 'Аналитика и статистика',
};

const TenantSettings: React.FC = () => {
  usePageTitle('Настройки');
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [passwordForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [profileEditing, setProfileEditing] = useState(false);
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [disableModal, setDisableModal] = useState(false);
  const [tenantApiStatus, setTenantApiStatus] = useState<'unknown' | 'ok' | 'error'>(() => (localStorage.getItem('ngrent_1c_t_status') as any) || 'unknown');
  const [tenantApiTime, setTenantApiTime] = useState<string | null>(() => localStorage.getItem('ngrent_1c_t_time'));
  const [disableCode, setDisableCode] = useState('');

  // Профиль
  const updateProfileMutation = useMutation({
    mutationFn: (dto: { fullName?: string; phone?: string }) => authApi.updateProfile(dto),
    onSuccess: async () => { const me = await authApi.me(); setUser(me); setProfileEditing(false); message.success('Профиль обновлён'); },
    onError: () => message.error('Ошибка'),
  });
  const changePasswordMutation = useMutation({
    mutationFn: (dto: ChangePasswordDto) => authApi.changePassword(dto),
    onSuccess: () => { passwordForm.resetFields(); message.success('Пароль изменён'); },
    onError: () => message.error('Ошибка'),
  });

  // 2FA setup state
  const [setupModal, setSetupModal] = useState(false);
  const [setupMethod, setSetupMethod] = useState<'email' | 'totp'>('totp');
  const [totpStep, setTotpStep] = useState<'choose' | 'qr' | 'confirm'>('choose');
  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const handleToggle2fa = () => {
    if (!user) return;
    if (user.is2faEnabled) { setDisableModal(true); return; }
    setSetupModal(true);
    setTotpStep('choose');
    setSetupMethod('totp');
    setTotpQr('');
    setTotpSecret('');
    setTotpCode('');
  };

  const handleSetupNext = async () => {
    if (setupMethod === 'email') {
      setTwoFaLoading(true);
      try { await authApi.enable2fa(); const me = await authApi.me(); setUser(me); message.success('2FA включена'); setSetupModal(false); }
      catch { message.error('Ошибка'); }
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
      try { await authApi.confirmTotp(totpCode); const me = await authApi.me(); setUser(me); message.success('Google Authenticator настроен'); setSetupModal(false); }
      catch { message.error('Неверный код'); }
      finally { setTwoFaLoading(false); }
    }
  };

  const handleDisable2fa = async () => {
    if (!disableCode) return;
    setTwoFaLoading(true);
    try { await authApi.disable2fa(disableCode); const me = await authApi.me(); setUser(me); message.success('2FA отключена'); setDisableModal(false); setDisableCode(''); }
    catch { message.error('Неверный код'); }
    finally { setTwoFaLoading(false); }
  };

  // Уведомления
  const { data: prefs } = useQuery({ queryKey: ['preferences'], queryFn: () => settingsApi.getPreferences() });
  const updatePrefsMutation = useMutation({
    mutationFn: (settings: Record<string, boolean>) => settingsApi.updatePreferences({ settings }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['preferences'] }); message.success('Сохранено'); },
  });
  const prefsData = (prefs as Record<string, unknown>)?.settings as Record<string, boolean> | undefined;

  // Соответствие требованиям
  const { data: consents } = useQuery({ queryKey: ['compliance-consents'], queryFn: () => complianceApi.consents() });
  const consentMutation = useMutation({
    mutationFn: (type: string) => complianceApi.recordConsent(type),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance-consents'] }); message.success('Согласие зафиксировано'); },
    onError: () => message.error('Ошибка'),
  });
  const dataExportMutation = useMutation({
    mutationFn: () => complianceApi.requestDataExport(),
    onSuccess: () => message.success('Запрос на экспорт создан'),
    onError: () => message.error('Ошибка'),
  });

  // 1C
  const { data: health1c } = useQuery({ queryKey: ['1c-health'], queryFn: () => integration1cApi.health(), retry: false });
  const export1cMutation = useMutation({
    mutationFn: () => integration1cApi.export(),
    onSuccess: () => message.success('Экспорт в 1С выполнен'),
    onError: () => message.error('Ошибка экспорта'),
  });

  // Данные тенанта для реквизитов
  const { data: tenantData } = useQuery({ queryKey: ['tenant-requisites'], queryFn: () => authApi.me() });
  const tenantInfo = (tenantData as any)?.tenant;

  const profileTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Информация" extra={!profileEditing ? (
        <Button icon={<EditOutlined />} onClick={() => { profileForm.setFieldsValue({ fullName: user?.fullName, phone: user?.phone }); setProfileEditing(true); }}>Редактировать</Button>
      ) : (
        <Space>
          <Button icon={<CheckOutlined />} type="primary" loading={updateProfileMutation.isPending} onClick={() => profileForm.validateFields().then((v) => updateProfileMutation.mutate(v))}>Сохранить</Button>
          <Button icon={<CloseOutlined />} onClick={() => setProfileEditing(false)}>Отмена</Button>
        </Space>
      )}>
        {profileEditing ? (
          <Form form={profileForm} layout="vertical" style={{ maxWidth: 400 }}>
            <Form.Item name="fullName" label="ФИО" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="phone" label="Телефон"><Input placeholder="+7 (999) 123-45-67" /></Form.Item>
          </Form>
        ) : (
          <Descriptions column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="ФИО">{user?.fullName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{user?.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="Телефон">{user?.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Компания">{user?.tenantName || tenantInfo?.name || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>
      <Card title="Безопасность">
        <Space direction="vertical" size={12}>
          <Space><Text>2FA</Text><Switch checked={user?.is2faEnabled} loading={twoFaLoading} onChange={handleToggle2fa} /></Space>
          <Form form={passwordForm} layout="vertical" onFinish={(v: ChangePasswordDto) => changePasswordMutation.mutate(v)} style={{ maxWidth: 400 }}>
            <Form.Item name="currentPassword" label="Текущий пароль" rules={[{ required: true }]}><Input.Password /></Form.Item>
            <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true }, { min: 8, message: 'Мин. 8 символов' }]}><Input.Password /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" loading={changePasswordMutation.isPending}>Сменить пароль</Button></Form.Item>
          </Form>
        </Space>
      </Card>
    </Space>
  );

  const [reqForm] = Form.useForm();

  React.useEffect(() => {
    if (tenantInfo) reqForm.setFieldsValue(tenantInfo);
  }, [tenantInfo, reqForm]);

  const saveRequisitesMutation = useMutation({
    mutationFn: async (v: any) => {
      const { default: apiClient } = await import('../../api/client');
      return apiClient.patch('/auth/tenant', v);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenant-requisites'] }); message.success('Реквизиты сохранены'); },
    onError: () => message.error('Ошибка сохранения'),
  });

  const requisitesTab = (
    <Card title="Реквизиты вашей компании" extra={<Text type="secondary">Используются в договорах и счетах</Text>}>
      <Form form={reqForm} layout="vertical" style={{ maxWidth: 600 }} onFinish={(v) => saveRequisitesMutation.mutate(v)}>
        <Form.Item name="name" label="Наименование организации"><Input /></Form.Item>
        <Form.Item name="inn" label="ИНН"><Input maxLength={12} /></Form.Item>
        <Form.Item name="kpp" label="КПП"><Input maxLength={9} /></Form.Item>
        <Form.Item name="ogrn" label="ОГРН"><Input maxLength={15} /></Form.Item>
        <Form.Item name="legalAddress" label="Юридический адрес"><Input /></Form.Item>
        <Form.Item name="bankName" label="Наименование банка"><Input /></Form.Item>
        <Form.Item name="bankAccount" label="Расчётный счёт"><Input maxLength={20} /></Form.Item>
        <Form.Item name="corrAccount" label="Корреспондентский счёт"><Input maxLength={20} /></Form.Item>
        <Form.Item name="bik" label="БИК"><Input maxLength={9} /></Form.Item>
        <Form.Item name="vatRate" label="Ставка НДС">
          <Select>
            <Select.Option value={20}>20% (ОСНО)</Select.Option>
            <Select.Option value={0}>0% (УСН, без НДС)</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" loading={saveRequisitesMutation.isPending}>Сохранить реквизиты</Button></Form.Item>
      </Form>
    </Card>
  );

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

  const EXCEL_LABELS: Record<string, string> = { invoices: 'Счета', contracts: 'Договоры', acts: 'Акты' };
  const downloadExcel = async (type: 'invoices' | 'contracts' | 'acts') => {
    try {
      const { default: apiClient } = await import('../../api/client');
      // Арендатор использует свои эндпоинты /my/export/ (фильтрация по клиенту, не по тенанту)
      const response = await apiClient.get(`/my/export/${type}/excel`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `my-${type}-export.xlsx`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
      message.success(`${EXCEL_LABELS[type] || type} выгружены в Excel`);
    } catch { message.error('Ошибка экспорта'); }
  };

  const integration1cTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Экспорт данных для 1С">
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Скачайте данные в формате Excel для загрузки в 1С:Бухгалтерию
        </Text>
        <Space wrap>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel('invoices')}>Выгрузить счета (Excel)</Button>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel('contracts')}>Выгрузить договоры (Excel)</Button>
          <Button icon={<SyncOutlined />} onClick={() => downloadExcel('acts')}>Выгрузить акты (Excel)</Button>
        </Space>
      </Card>
      <Card title="API-интеграция с 1С">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space>
            <Text>Статус:</Text>
            <Tag color={tenantApiStatus === 'ok' ? 'green' : tenantApiStatus === 'error' ? 'red' : 'default'}>
              {tenantApiStatus === 'ok' ? 'Подключено' : tenantApiStatus === 'error' ? 'Нет связи' : 'Не проверено'}
            </Tag>
            {tenantApiTime && <Text type="secondary" style={{ fontSize: 12 }}>проверено {tenantApiTime}</Text>}
          </Space>
          <Space wrap>
            <Button icon={<ApiOutlined />} onClick={() => {
              setTenantApiStatus('unknown');
              integration1cApi.health().then((data: any) => {
                const time = new Date().toLocaleTimeString('ru-RU');
                const status = data?.status === 'connected' || data?.apiAvailable ? 'ok' : 'error';
                setTenantApiStatus(status as any);
                setTenantApiTime(time);
                localStorage.setItem('ngrent_1c_t_status', status);
                localStorage.setItem('ngrent_1c_t_time', time);
              }).catch(() => {
                const time = new Date().toLocaleTimeString('ru-RU');
                setTenantApiStatus('error');
                setTenantApiTime(time);
                localStorage.setItem('ngrent_1c_t_status', 'error');
                localStorage.setItem('ngrent_1c_t_time', time);
              });
            }}>Проверить подключение</Button>
            <Button type="primary" icon={<SyncOutlined />} onClick={() => export1cMutation.mutate()} loading={export1cMutation.isPending}>Выгрузить в 1С</Button>
          </Space>
          <Text type="secondary">
            Откройте обработку «Обмен NGRent» в 1С для синхронизации данных.
          </Text>
        </Space>
      </Card>
    </Space>
  );

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
          { title: 'Цель', key: 'type', render: (_: unknown, r: any) => PURPOSE_MAP[r.type] || r.type || '—' },
          { title: 'Дата', key: 'date', render: (_: unknown, r: any) => r.acceptedAt ? new Date(r.acceptedAt).toLocaleDateString('ru-RU') : '—' },
          { title: 'Статус', key: 'status', render: () => <Tag color="green">Активно</Tag> },
          { title: '', key: 'action', width: 120, render: (_: unknown, r: any) => (
            <Popconfirm title="Отозвать согласие?" okText="Да" cancelText="Нет" onConfirm={() => revokeMutation.mutate(r.id)}>
              <Button size="small" danger>Отозвать</Button>
            </Popconfirm>
          )},
        ]} locale={{ emptyText: 'Согласия не зафиксированы. Нажмите кнопку ниже.' }} />
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
        <Button danger onClick={() => { complianceApi.deleteAccount().then(() => message.success('Запрос на удаление принят')).catch(() => message.error('Ошибка')); }}>Запросить удаление аккаунта</Button>
      </Card>
    </Space>
  );

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Настройки</Title>
      <Tabs items={[
        { key: 'profile', label: 'Профиль', children: profileTab },
        { key: 'requisites', label: 'Реквизиты', children: requisitesTab },
        { key: 'notifications', label: 'Уведомления', children: notificationsTab },
        { key: '1c', label: 'Интеграция 1С', children: integration1cTab },
        { key: 'compliance', label: '152-ФЗ', children: complianceTab },
      ]} />
      {/* Модалка настройки 2FA */}
      <Modal
        title={totpStep === 'choose' ? 'Включить 2FA' : totpStep === 'qr' ? 'Сканируйте QR-код' : 'Подтвердите настройку'}
        open={setupModal}
        onCancel={() => { setSetupModal(false); setTotpCode(''); }}
        onOk={handleSetupNext}
        okText={totpStep === 'choose' && setupMethod === 'email' ? 'Включить' : totpStep === 'confirm' ? 'Подтвердить' : 'Далее'}
        cancelText="Отмена"
        confirmLoading={twoFaLoading}
        width={window.innerWidth < 500 ? '95%' : 480}
      >
        {totpStep === 'choose' && (
          <div>
            <Text style={{ display: 'block', marginBottom: 16 }}>Выберите способ получения кодов:</Text>
            <Radio.Group value={setupMethod} onChange={(e) => setSetupMethod(e.target.value)} style={{ width: '100%' }}>
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
      <Modal title="Отключение 2FA" open={disableModal} onCancel={() => { setDisableModal(false); setDisableCode(''); }} onOk={handleDisable2fa} okText="Отключить" cancelText="Отмена" confirmLoading={twoFaLoading}>
        <Text style={{ display: 'block', marginBottom: 12 }}>Введите код из email или Google Authenticator:</Text>
        <Input placeholder="Код" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} maxLength={6} size="large" />
      </Modal>
    </div>
  );
};

export default TenantSettings;
