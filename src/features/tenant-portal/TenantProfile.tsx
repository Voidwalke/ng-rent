import React, { useState } from 'react';
import { Typography, Card, Descriptions, Form, Input, Button, Switch, Modal, message, Space, Radio } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, GoogleOutlined, MailOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import type { ChangePasswordDto } from '../../types/auth';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const TenantProfile: React.FC = () => {
  usePageTitle('Мой профиль');
  const { user, setUser } = useAuthStore();
  const [passwordForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [profileEditing, setProfileEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // ─── 2FA setup ────────────────────────────────
  const [setupModal, setSetupModal] = useState(false);
  const [setupMethod, setSetupMethod] = useState<'email' | 'totp'>('totp');
  // Поток email: 'choose' → 'emailCode' ; поток totp: 'choose' → 'qr' → 'totpCode'
  const [step, setStep] = useState<'choose' | 'emailCode' | 'qr' | 'totpCode'>('choose');
  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [code, setCode] = useState('');

  // ─── 2FA disable ──────────────────────────────
  const [disableModal, setDisableModal] = useState(false);
  const [disableMethod, setDisableMethod] = useState<'code' | 'password'>('code');
  const [disableValue, setDisableValue] = useState('');

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

  // ─── Enable 2FA ───────────────────────────────
  const openSetup = () => {
    setSetupModal(true);
    setStep('choose');
    setSetupMethod('totp');
    setTotpQr('');
    setTotpSecret('');
    setCode('');
  };

  const handleSetupNext = async () => {
    setLoading(true);
    try {
      if (step === 'choose') {
        if (setupMethod === 'email') {
          // Отправка OTP на email
          await authApi.enable2fa();
          setStep('emailCode');
          message.info('Код отправлен на ' + user?.email);
        } else {
          // Генерация QR для TOTP
          const res = await authApi.enableTotp();
          setTotpQr(res.qrCode);
          setTotpSecret(res.secret);
          setStep('qr');
        }
      } else if (step === 'emailCode') {
        if (!code || code.length !== 6) { message.warning('Введите 6-значный код'); setLoading(false); return; }
        await authApi.enable2fa(code);
        const me = await authApi.me();
        setUser(me);
        message.success('2FA по email включена');
        setSetupModal(false);
      } else if (step === 'qr') {
        setStep('totpCode');
      } else if (step === 'totpCode') {
        if (!code || code.length !== 6) { message.warning('Введите 6-значный код'); setLoading(false); return; }
        await authApi.confirmTotp(code);
        const me = await authApi.me();
        setUser(me);
        message.success('Google Authenticator настроен');
        setSetupModal(false);
      }
    } catch {
      message.error(step === 'emailCode' || step === 'totpCode' ? 'Неверный код' : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  // ─── Disable 2FA ──────────────────────────────
  const openDisable = () => {
    setDisableModal(true);
    setDisableMethod('code');
    setDisableValue('');
  };

  const handleDisable = async () => {
    if (!disableValue) return;
    setLoading(true);
    try {
      const dto = disableMethod === 'password'
        ? { password: disableValue }
        : { code: disableValue };
      await authApi.disable2fa(dto);
      const me = await authApi.me();
      setUser(me);
      message.success('2FA отключена');
      setDisableModal(false);
    } catch {
      message.error(disableMethod === 'password' ? 'Неверный пароль' : 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!user) return;
    user.is2faEnabled ? openDisable() : openSetup();
  };

  // ─── Modal titles / buttons ───────────────────
  const setupTitles: Record<string, string> = {
    choose: 'Включить 2FA',
    emailCode: 'Подтвердите email',
    qr: 'Отсканируйте QR-код',
    totpCode: 'Введите код',
  };
  const setupOk: Record<string, string> = {
    choose: 'Далее',
    emailCode: 'Подтвердить',
    qr: 'Далее',
    totpCode: 'Подтвердить',
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Мой профиль</Title>

      <Card title="Информация" style={{ marginBottom: 16 }} extra={
        !profileEditing ? (
          <Button icon={<EditOutlined />} onClick={() => { profileForm.setFieldsValue({ fullName: user?.fullName, phone: user?.phone }); setProfileEditing(true); }}>Редактировать</Button>
        ) : (
          <Space>
            <Button icon={<CheckOutlined />} type="primary" loading={updateProfileMutation.isPending} onClick={() => profileForm.validateFields().then((v) => updateProfileMutation.mutate(v))}>Сохранить</Button>
            <Button icon={<CloseOutlined />} onClick={() => setProfileEditing(false)}>Отмена</Button>
          </Space>
        )
      }>
        {profileEditing ? (
          <Form form={profileForm} layout="vertical" style={{ maxWidth: 400 }}>
            <Form.Item name="fullName" label="ФИО" rules={[{ required: true, message: 'Введите ФИО' }]}><Input /></Form.Item>
            <Form.Item name="phone" label="Телефон"><Input placeholder="+7 (999) 123-45-67" /></Form.Item>
          </Form>
        ) : (
          <Descriptions column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="ФИО">{user?.fullName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{user?.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="Телефон">{user?.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Роль">{user?.role || '—'}</Descriptions.Item>
            <Descriptions.Item label="Компания">{user?.tenantName || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="Двухфакторная аутентификация" style={{ marginBottom: 16 }}>
        <Space>
          <Text>2FA {user?.is2faEnabled ? 'включена' : 'отключена'}</Text>
          <Switch checked={user?.is2faEnabled} loading={loading} onChange={handleToggle} />
        </Space>
      </Card>

      {/* ─── Модалка включения 2FA ─── */}
      <Modal
        title={setupTitles[step]}
        open={setupModal}
        onCancel={() => setSetupModal(false)}
        onOk={handleSetupNext}
        okText={setupOk[step]}
        cancelText="Отмена"
        confirmLoading={loading}
        width={window.innerWidth < 500 ? '95%' : 480}
      >
        {step === 'choose' && (
          <Radio.Group value={setupMethod} onChange={(e) => setSetupMethod(e.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Radio value="totp" style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, width: '100%' }}>
                <Space>
                  <GoogleOutlined style={{ fontSize: 20, color: '#4285f4' }} />
                  <div>
                    <Text strong>Google Authenticator</Text><br />
                    <Text type="secondary" style={{ fontSize: 12 }}>Коды генерируются в приложении на телефоне</Text>
                  </div>
                </Space>
              </Radio>
              <Radio value="email" style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, width: '100%' }}>
                <Space>
                  <MailOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                  <div>
                    <Text strong>Email</Text><br />
                    <Text type="secondary" style={{ fontSize: 12 }}>Код отправляется на {user?.email}</Text>
                  </div>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        )}

        {step === 'emailCode' && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ display: 'block', marginBottom: 16 }}>Введите 6-значный код из письма на {user?.email}:</Text>
            <Input
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              size="large"
              style={{ width: 200, textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
            />
          </div>
        )}

        {step === 'qr' && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ display: 'block', marginBottom: 16 }}>Откройте Google Authenticator и отсканируйте QR-код:</Text>
            {totpQr && <img src={totpQr} alt="QR" style={{ width: 200, height: 200, margin: '0 auto 16px' }} />}
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Или введите ключ вручную:</Text>
            <Text code copyable style={{ fontSize: 14 }}>{totpSecret}</Text>
          </div>
        )}

        {step === 'totpCode' && (
          <div style={{ textAlign: 'center' }}>
            <Text style={{ display: 'block', marginBottom: 16 }}>Введите 6-значный код из Google Authenticator:</Text>
            <Input
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              size="large"
              style={{ width: 200, textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
            />
          </div>
        )}
      </Modal>

      {/* ─── Модалка отключения 2FA ─── */}
      <Modal
        title="Отключение 2FA"
        open={disableModal}
        onCancel={() => setDisableModal(false)}
        onOk={handleDisable}
        okText="Отключить"
        okButtonProps={{ danger: true }}
        cancelText="Отмена"
        confirmLoading={loading}
      >
        <Radio.Group value={disableMethod} onChange={(e) => { setDisableMethod(e.target.value); setDisableValue(''); }} style={{ marginBottom: 16 }}>
          <Radio.Button value="code">Код (TOTP / email)</Radio.Button>
          <Radio.Button value="password">Пароль</Radio.Button>
        </Radio.Group>

        {disableMethod === 'code' ? (
          <Input
            placeholder="6-значный код"
            value={disableValue}
            onChange={(e) => setDisableValue(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            size="large"
            style={{ textAlign: 'center', fontSize: 20, letterSpacing: 6 }}
          />
        ) : (
          <Input.Password
            placeholder="Текущий пароль"
            value={disableValue}
            onChange={(e) => setDisableValue(e.target.value)}
            size="large"
          />
        )}
      </Modal>

      <Card title="Изменить пароль">
        <Form form={passwordForm} layout="vertical" onFinish={(v: ChangePasswordDto) => changePasswordMutation.mutate(v)} style={{ maxWidth: 400 }}>
          <Form.Item name="currentPassword" label="Текущий пароль" rules={[{ required: true, message: 'Введите текущий пароль' }]}><Input.Password /></Form.Item>
          <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true, message: 'Введите новый пароль' }, { min: 8, message: 'Минимум 8 символов' }]}><Input.Password /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={changePasswordMutation.isPending}>Сменить пароль</Button></Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default TenantProfile;
