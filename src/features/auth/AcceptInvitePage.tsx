import React from 'react';
import { Card, Form, Input, Button, Typography, message, Result, theme } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { normalizeUser } from '../../types/auth';
import { useNavigate } from 'react-router-dom';
import type { AuthResponse } from '../../types/auth';

const { Title, Text } = Typography;

const AcceptInvitePage: React.FC = () => {
  const { token: themeToken } = theme.useToken();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { setUser, setTokens, fetchProfile } = useAuthStore();

  const mutation = useMutation({
    mutationFn: (data: { fullName: string; password: string }) =>
      authApi.acceptInvite({ token, ...data }),
    onSuccess: (res: AuthResponse) => {
      setTokens(res.accessToken, res.refreshToken);
      setUser(normalizeUser(res.user));
      fetchProfile();
      message.success('Приглашение принято!');
      navigate('/dashboard');
    },
    onError: () => message.error('Ошибка. Ссылка могла устареть.'),
  });

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: themeToken.colorBgLayout }}>
        <Card style={{ width: 420, borderRadius: 16 }}>
          <Result
            status="error"
            title="Недействительная ссылка"
            extra={<Link to="/login"><Button type="primary">Войти</Button></Link>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: themeToken.colorBgLayout }}>
      <Card style={{ width: 420, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 8 }}>Принять приглашение</Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          Заполните данные для завершения регистрации
        </Text>

        <Form
          layout="vertical"
          onFinish={(v: { fullName: string; password: string }) => mutation.mutate(v)}
        >
          <Form.Item name="fullName" rules={[{ required: true, message: 'Введите ФИО' }]}>
            <Input prefix={<UserOutlined />} placeholder="ФИО" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Введите пароль' }, { min: 8, message: 'Минимум 8 символов' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Пароль" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={mutation.isPending}>
              Принять приглашение
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default AcceptInvitePage;
