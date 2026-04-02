import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Divider, message, Space, theme } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { normalizeUser } from '../../types/auth';
import type { LoginDto, LoginResponse } from '../../types/auth';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const LoginPage: React.FC = () => {
  usePageTitle('Вход');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const { setUser, setTokens, fetchProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const loginMutation = useMutation({
    mutationFn: (data: LoginDto) => authApi.login(data),
    onSuccess: (res: LoginResponse) => {
      if ('requires2fa' in res && res.requires2fa) {
        navigate('/2fa', { state: { tempToken: res.tempToken, totpEnabled: res.totpEnabled } });
        return;
      }
      if ('accessToken' in res) {
        setTokens(res.accessToken, res.refreshToken);
        setUser(normalizeUser(res.user));
        fetchProfile();
        message.success('Добро пожаловать!');
        if (redirectTo) {
          navigate(redirectTo);
        } else if (res.user.role === 'super_admin') {
          navigate('/superadmin');
        } else if (res.user.role === 'tenant') {
          navigate('/my');
        } else {
          navigate('/dashboard');
        }
      }
    },
    onError: () => {
      message.error('Неверный email или пароль');
    },
    onSettled: () => setLoading(false),
  });

  const onFinish = (values: LoginDto) => {
    setLoading(true);
    loginMutation.mutate(values);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: token.colorBgLayout, padding: '24px 16px' }}>
      <Card style={{ width: '100%', maxWidth: 420, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space align="center" size={8}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>
              N
            </div>
            <Text strong style={{ fontSize: 22 }}>NGRent</Text>
          </Space>
          <Title level={4} style={{ marginTop: 16, marginBottom: 0 }}>Вход в систему</Title>
        </div>

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Некорректный email' }]}>
            <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Пароль" size="large" />
          </Form.Item>
          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <Link to="/forgot-password">Забыли пароль?</Link>
          </div>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Войти
            </Button>
          </Form.Item>
        </Form>
        <Divider>или</Divider>
        <div style={{ textAlign: 'center' }}>
          <Text>Нет аккаунта? </Text>
          <Link to="/register">Зарегистрироваться</Link>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
