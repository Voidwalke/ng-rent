import React from 'react';
import { Button, Card, Typography, Row, Col, Tag, Space, theme } from 'antd';
import {
  HomeOutlined,
  FileTextOutlined,
  BarChartOutlined,
  SafetyOutlined,
  TeamOutlined,
  CloudOutlined,
  CheckOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';

const { Title, Text, Paragraph } = Typography;

const features = [
  { icon: <HomeOutlined style={{ fontSize: 32, color: '#2563eb' }} />, title: 'Управление объектами', desc: 'Учёт зданий, помещений, площадей и статусов аренды в одном месте.' },
  { icon: <FileTextOutlined style={{ fontSize: 32, color: '#2563eb' }} />, title: 'Договоры и ЭДО', desc: 'Автогенерация договоров из шаблонов, электронный документооборот.' },
  { icon: <BarChartOutlined style={{ fontSize: 32, color: '#2563eb' }} />, title: 'Финансовая аналитика', desc: 'Доходы, задолженность, прогнозы и отчёты в реальном времени.' },
  { icon: <SafetyOutlined style={{ fontSize: 32, color: '#2563eb' }} />, title: 'СКУД', desc: 'Управление карточками доступа, автоблокировка при задолженности.' },
  { icon: <TeamOutlined style={{ fontSize: 32, color: '#2563eb' }} />, title: 'Мультитенантность', desc: 'Полная изоляция данных управляющих компаний через Row-Level Security.' },
  { icon: <CloudOutlined style={{ fontSize: 32, color: '#2563eb' }} />, title: 'SaaS-модель', desc: 'Подписочная модель, гибкие тарифы, работа из браузера.' },
];

const plans = [
  { name: 'Free', price: '0', period: '/мес', features: ['1 объект', '5 помещений', '1 пользователь', 'Базовая аналитика'], popular: false },
  { name: 'Basic', price: '5 000', period: '/мес', features: ['5 объектов', '50 помещений', '5 пользователей', 'ЭДО', 'СКУД'], popular: false },
  { name: 'Pro', price: '15 000', period: '/мес', features: ['20 объектов', '500 помещений', '20 пользователей', 'Расширенная аналитика', 'API доступ', 'Приоритетная поддержка'], popular: true },
  { name: 'Enterprise', price: '45 000', period: '/мес', features: ['Без ограничений', 'Неограниченно пользователей', 'Выделенный сервер', 'SLA 99.9%', 'Персональный менеджер', 'Кастомная интеграция'], popular: false },
];

const LandingPage: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { isAuthenticated, user } = useAuthStore();

  return (
    <div style={{ minHeight: '100vh', background: token.colorBgContainer }}>
      {/* Шапка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px clamp(16px, 4vw, 48px)', borderBottom: `1px solid ${token.colorBorderSecondary}`, flexWrap: 'wrap', gap: 12 }}>
        <Space align="center" size={12}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
            N
          </div>
          <Text strong style={{ fontSize: 20 }}>NGRent</Text>
        </Space>
        <Space size={16} wrap>
          <Link to="/catalog">Каталог помещений</Link>
          {isAuthenticated ? (
            <Button type="primary" onClick={() => navigate(user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager' ? '/dashboard' : '/my')}>
              Личный кабинет
            </Button>
          ) : (
            <>
              <Link to="/login">Войти</Link>
              <Button type="primary" onClick={() => navigate('/register')}>Регистрация</Button>
            </>
          )}
          <Button type="text" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Space>
      </div>

      {/* Главный блок */}
      <div style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', padding: 'clamp(40px, 8vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <Title style={{ color: '#fff', fontSize: 'clamp(24px, 5vw, 42px)', marginBottom: 16 } as any}>
          Платформа для управления коммерческой недвижимостью
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, maxWidth: 640, margin: '0 auto 32px' }}>
          Автоматизируйте аренду, договоры, платежи и аналитику. Всё в одном облачном решении для управляющих компаний.
        </Paragraph>
        <Space size={16}>
          <Button type="primary" size="large" ghost onClick={() => navigate(isAuthenticated ? '/dashboard' : '/register')} style={{ borderColor: '#fff', color: '#fff' }}>
            {isAuthenticated ? 'Перейти в кабинет' : 'Начать бесплатно'}
          </Button>
          <Button size="large" onClick={() => navigate('/catalog')} style={{ background: token.colorBgContainer }}>
            Смотреть каталог
          </Button>
        </Space>
      </div>

      {/* Возможности */}
      <div style={{ padding: 'clamp(40px, 8vw, 80px) clamp(16px, 4vw, 48px)', maxWidth: 1200, margin: '0 auto' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 48 }}>Возможности платформы</Title>
        <Row gutter={[24, 24]}>
          {features.map((f, i) => (
            <Col xs={24} sm={12} md={8} key={i}>
              <Card hoverable style={{ height: '100%', textAlign: 'center' }}>
                <div style={{ marginBottom: 16 }}>{f.icon}</div>
                <Title level={4}>{f.title}</Title>
                <Text type="secondary">{f.desc}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Статистика */}
      <div style={{ padding: 'clamp(32px, 6vw, 56px) clamp(16px, 4vw, 48px)', background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}`, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Row gutter={[24, 24]} justify="center" style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          {[
            { value: '500+', label: 'компаний доверяют NGRent' },
            { value: '10 000+', label: 'помещений на платформе' },
            { value: '98%', label: 'продление подписок' },
            { value: '24/7', label: 'поддержка клиентов' },
          ].map((s, i) => (
            <Col xs={12} sm={6} key={i}>
              <Text style={{ fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 700, color: '#2563eb', display: 'block', lineHeight: 1.2 }}>{s.value}</Text>
              <Text type="secondary" style={{ fontSize: 14 }}>{s.label}</Text>
            </Col>
          ))}
        </Row>
      </div>

      {/* Тарифы */}
      <div style={{ padding: 'clamp(40px, 8vw, 80px) clamp(16px, 4vw, 48px)', background: token.colorBgLayout }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 48 }}>Тарифы</Title>
        <Row gutter={[24, 24]} justify="center" style={{ maxWidth: 1200, margin: '0 auto' }}>
          {plans.map((p) => (
            <Col xs={24} sm={12} md={6} key={p.name}>
              <Card
                hoverable
                style={{
                  height: '100%',
                  textAlign: 'center',
                  border: p.popular ? '2px solid #2563eb' : undefined,
                  position: 'relative',
                }}
              >
                {p.popular && (
                  <Tag color="#2563eb" style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)' }}>
                    Популярный
                  </Tag>
                )}
                <Title level={4} style={{ marginTop: p.popular ? 8 : 0 }}>{p.name}</Title>
                <div style={{ margin: '16px 0' }}>
                  <Text style={{ fontSize: 36, fontWeight: 700 }}>{p.price}</Text>
                  <Text type="secondary"> &#8381;{p.period}</Text>
                </div>
                <div style={{ textAlign: 'left', marginBottom: 24 }}>
                  {p.features.map((feat, i) => (
                    <div key={i} style={{ padding: '4px 0' }}>
                      <CheckOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                      <Text>{feat}</Text>
                    </div>
                  ))}
                </div>
                <Button type={p.popular ? 'primary' : 'default'} block onClick={() => navigate('/register')}>
                  Выбрать
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Подвал */}
      <div style={{ padding: '32px clamp(16px, 4vw, 48px)', textAlign: 'center', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Space split={<span style={{ color: token.colorTextQuaternary }}>&middot;</span>} style={{ marginBottom: 8 }}>
          <Link to="/terms" style={{ color: token.colorTextSecondary, fontSize: 13 }}>Пользовательское соглашение</Link>
          <Link to="/privacy" style={{ color: token.colorTextSecondary, fontSize: 13 }}>Политика конфиденциальности</Link>
        </Space>
        <br />
        <Text type="secondary">&copy; {new Date().getFullYear()} NGRent. Все права защищены.</Text>
      </div>
    </div>
  );
};

export default LandingPage;
