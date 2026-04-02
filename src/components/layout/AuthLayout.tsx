import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout, Typography, theme } from 'antd';

const { Content } = Layout;
const { Title, Text } = Typography;

const AuthLayout: React.FC = () => {
  const { token } = theme.useToken();
  return (
    <Layout
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
      }}
    >
      <Content
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Title level={2} style={{ color: '#fff', marginBottom: 4 }}>
              NGRent
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
              Платформа управления коммерческой недвижимостью
            </Text>
          </div>

          <div
            style={{
              background: token.colorBgContainer,
              borderRadius: 12,
              padding: 32,
              boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            }}
          >
            <Outlet />
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default AuthLayout;
