import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Result, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import type { ForgotPasswordDto } from '../../types/auth';

const { Title } = Typography;

const ForgotPasswordPage: React.FC = () => {
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: ForgotPasswordDto) => authApi.forgotPassword(data),
    onSuccess: () => setSent(true),
    onError: () => message.error('Ошибка. Попробуйте позже.'),
  });

  if (sent) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
        <Card style={{ width: 420, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Result
            status="success"
            title="Письмо отправлено"
            subTitle="Проверьте почту и перейдите по ссылке для сброса пароля."
            extra={<Link to="/login"><Button type="primary">Вернуться ко входу</Button></Link>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <Card style={{ width: 420, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>Восстановление пароля</Title>
        <Form layout="vertical" onFinish={(v: ForgotPasswordDto) => mutation.mutate(v)}>
          <Form.Item name="email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Некорректный email' }]}>
            <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={mutation.isPending}>
              Отправить ссылку
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Link to="/login">Вернуться ко входу</Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
