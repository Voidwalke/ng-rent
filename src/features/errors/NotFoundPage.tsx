import React from 'react';
import { Button, Space, Typography, theme } from 'antd';
import { HomeOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph } = Typography;

const NotFoundPage: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: token.colorBgLayout,
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div
          style={{
            fontSize: 120,
            fontWeight: 800,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 16,
          }}
        >
          404
        </div>

        <Title level={2} style={{ marginBottom: 8 }}>
          Страница не найдена
        </Title>

        <Paragraph
          type="secondary"
          style={{ fontSize: 16, marginBottom: 32 }}
        >
          К сожалению, запрашиваемая страница не существует, была удалена или временно
          недоступна. Проверьте правильность адреса или воспользуйтесь ссылками ниже.
        </Paragraph>

        <Space size={16} wrap style={{ justifyContent: 'center' }}>
          <Button
            type="primary"
            size="large"
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
          >
            На главную
          </Button>
          <Button
            size="large"
            icon={<AppstoreOutlined />}
            onClick={() => navigate('/catalog')}
          >
            Каталог
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default NotFoundPage;
