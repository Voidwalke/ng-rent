import React, { useRef, useState, useEffect } from 'react';
import { Card, Input, Button, Typography, message, Space, theme } from 'antd';
import { GoogleOutlined, MailOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { normalizeUser } from '../../types/auth';
import type { AuthResponse } from '../../types/auth';

const { Title, Text } = Typography;

const TwoFaPage: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setTokens, fetchProfile } = useAuthStore();
  const state = location.state as { tempToken?: string; totpEnabled?: boolean } | undefined;
  const tempToken = state?.tempToken;
  const totpEnabled = state?.totpEnabled ?? false;

  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendDisabled, setResendDisabled] = useState(true);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (!tempToken) {
      navigate('/login');
    }
    setCountdown(30);
    setResendDisabled(true);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); setResendDisabled(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tempToken, navigate]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const verifyMutation = useMutation({
    mutationFn: (code: string) => authApi.verifyOtp({ tempToken: tempToken!, code }),
    onSuccess: (res: AuthResponse) => {
      setTokens(res.accessToken, res.refreshToken);
      setUser(normalizeUser(res.user));
      fetchProfile();
      message.success('Вход выполнен');
      navigate(res.user?.role === 'super_admin' ? '/superadmin' : res.user?.role === 'tenant' ? '/my' : '/dashboard');
    },
    onError: () => {
      message.error('Неверный код');
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
    },
  });

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== '') && next.join('').length === 6) {
      verifyMutation.mutate(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      const next = pasted.split('');
      setDigits(next);
      inputRefs.current[5]?.focus();
      verifyMutation.mutate(pasted);
    }
  };

  const handleResend = () => {
    message.info('Код отправлен повторно');
    setResendDisabled(true);
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); setResendDisabled(false); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: token.colorBgLayout }}>
      <Card style={{ width: 420, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        <Title level={4} style={{ marginBottom: 8 }}>Двухфакторная аутентификация</Title>

        {totpEnabled ? (
          <Space direction="vertical" size={4} style={{ marginBottom: 32 }}>
            <Space size={8}>
              <GoogleOutlined style={{ fontSize: 18, color: '#4285f4' }} />
              <Text type="secondary">Google Authenticator</Text>
            </Space>
            <Text type="secondary">
              Введите 6-значный код из приложения
            </Text>
          </Space>
        ) : (
          <Space direction="vertical" size={4} style={{ marginBottom: 32 }}>
            <Space size={8}>
              <MailOutlined style={{ fontSize: 18, color: '#52c41a' }} />
              <Text type="secondary">Код отправлен на email</Text>
            </Space>
            <Text type="secondary">
              Введите 6-значный код из письма
            </Text>
          </Space>
        )}

        <Space size={8} style={{ marginBottom: 24 }}>
          {digits.map((d, i) => (
            <Input
              key={i}
              ref={(el) => { inputRefs.current[i] = el?.input ?? null; }}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              maxLength={1}
              style={{ width: 48, height: 56, textAlign: 'center', fontSize: 24, fontWeight: 600, borderRadius: 8 }}
            />
          ))}
        </Space>

        {!totpEnabled && (
          <div>
            <Button type="link" disabled={resendDisabled} onClick={handleResend}>
              {resendDisabled ? `Отправить повторно (${countdown}с)` : 'Отправить код повторно'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default TwoFaPage;
