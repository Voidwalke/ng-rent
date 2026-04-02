import React, { useState } from 'react';
import { Card, Form, Input, Button, Checkbox, Typography, message, Space, theme } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { normalizeUser } from '../../types/auth';
import type { RegisterDto, AuthResponse } from '../../types/auth';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const RegisterPage: React.FC = () => {
  usePageTitle('Регистрация');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const { setUser, setTokens, fetchProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const registerMutation = useMutation({
    mutationFn: (data: RegisterDto) => authApi.register(data),
    onSuccess: (res: AuthResponse) => {
      setTokens(res.accessToken, res.refreshToken);
      setUser(normalizeUser(res.user));
      fetchProfile();
      message.success('Регистрация прошла успешно!');
      navigate(redirectTo || '/dashboard');
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      const msg = axiosErr?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join('. ') : msg || 'Ошибка регистрации';
      message.error(text);
    },
    onSettled: () => setLoading(false),
  });

  const onFinish = (values: RegisterDto) => {
    setLoading(true);
    registerMutation.mutate(values);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: token.colorBgLayout, padding: '24px 16px' }}>
      <Card style={{ width: '100%', maxWidth: 520, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space align="center" size={8}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>
              N
            </div>
            <Text strong style={{ fontSize: 22 }}>NGRent</Text>
          </Space>
          <Title level={4} style={{ marginTop: 16, marginBottom: 0 }}>Регистрация УК</Title>
        </div>

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="companyName" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="ООО «Управление»" size="large" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Идентификатор (slug)"
            rules={[
              { required: true, message: 'Введите slug' },
              { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Только латиница, цифры и дефис' },
            ]}
            extra="Латинские буквы, цифры и дефис. Будет использоваться в URL."
          >
            <Input placeholder="my-company" size="large" />
          </Form.Item>
          <Form.Item name="fullName" label="ФИО администратора" rules={[{ required: true, message: 'Введите ФИО' }]}>
            <Input placeholder="Иванов Иван Иванович" size="large" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Некорректный email' }]}>
            <Input placeholder="admin@company.ru" size="large" />
          </Form.Item>
          <Form.Item name="inn" label="ИНН (необязательно)">
            <Input placeholder="1234567890" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Пароль"
            rules={[
              { required: true, message: 'Введите пароль' },
              { min: 8, message: 'Минимум 8 символов' },
              { pattern: /(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, message: 'Заглавная буква, цифра и спецсимвол' },
            ]}
          >
            <Input.Password placeholder="Заглавная буква, цифра и спецсимвол" size="large" />
          </Form.Item>
          <Form.Item
            name="acceptTerms"
            valuePropName="checked"
            rules={[{ validator: (_, v) => v ? Promise.resolve() : Promise.reject('Необходимо принять условия') }]}
          >
            <Checkbox>Принимаю условия использования</Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Зарегистрироваться
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text>Уже есть аккаунт? </Text>
          <Link to="/login">Войти</Link>
        </div>
      </Card>
    </div>
  );
};

export default RegisterPage;
