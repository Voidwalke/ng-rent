import React, { useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Badge,
  Button,
  Typography,
  theme,
  App as AntApp,
} from 'antd';
import {
  HomeOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  AuditOutlined,
  DollarOutlined,
  KeyOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
  QuestionCircleOutlined,
  ToolOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/auth';
import { useNotificationsStore } from '../../store/notifications';
import { useThemeStore } from '../../store/theme';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const TenantLayout: React.FC = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [collapsed, setCollapsed] = React.useState(isMobile);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { unreadCount, fetchUnreadCount } = useNotificationsStore();
  const { isDark, toggle } = useThemeStore();
  const { token } = theme.useToken();
  const { notification } = AntApp.useApp();
  const prevUnreadCount = useRef<number>(0);

  React.useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  React.useEffect(() => {
    if (prevUnreadCount.current > 0 && unreadCount > prevUnreadCount.current) {
      const diff = unreadCount - prevUnreadCount.current;
      notification.info({
        message: 'Новое уведомление',
        description: diff === 1
          ? 'Получено новое уведомление'
          : `Получено уведомлений: ${diff}`,
        placement: 'topRight',
        duration: 4,
      });
    }
    prevUnreadCount.current = unreadCount;
  }, [unreadCount, notification]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { key: '/my', icon: <HomeOutlined />, label: 'Главная' },
    { key: '/my/rented', icon: <HomeOutlined />, label: 'Мои помещения' },
    { key: '/my/units', icon: <AppstoreOutlined />, label: 'Каталог' },
    { key: '/my/applications', icon: <FileTextOutlined />, label: 'Мои заявки' },
    { key: '/my/contracts', icon: <AuditOutlined />, label: 'Мои договоры' },
    { key: '/my/invoices', icon: <DollarOutlined />, label: 'Мои счета' },
    { key: '/my/access-cards', icon: <KeyOutlined />, label: 'Пропуска' },
    { key: '/my/maintenance', icon: <ToolOutlined />, label: 'Обслуживание' },
    { key: '/my/documents', icon: <FileTextOutlined />, label: 'Документы' },
    { key: '/my/tickets', icon: <QuestionCircleOutlined />, label: 'Поддержка' },
    { key: '/my/help', icon: <QuestionCircleOutlined />, label: 'Помощь' },
    { key: '/my/settings', icon: <ToolOutlined />, label: 'Настройки' },
  ];

  const profileMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: 'Профиль',
        onClick: () => navigate('/my/profile'),
      },
      { type: 'divider' as const },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Выйти',
        danger: true,
        onClick: handleLogout,
      },
    ],
  };

  const selectedKey = location.pathname === '/my' ? '/my' : location.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="md"
        theme="light"
        width={220}
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Link to="/my" style={{ textDecoration: 'none' }}>
            <Text strong style={{ fontSize: collapsed ? 16 : 18, color: '#2563eb' }}>
              {collapsed ? 'NG' : 'NGRent'}
            </Text>
          </Link>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggle}
          />

          <Badge count={unreadCount} size="small">
            <BellOutlined
              style={{ fontSize: 18, cursor: 'pointer' }}
              onClick={() => navigate('/my/notifications')}
            />
          </Badge>
          <Dropdown menu={profileMenu} trigger={['click']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <Text ellipsis style={{ maxWidth: 140 }}>
                {user?.fullName}
              </Text>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24 }}>
          <div className="page-transition">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default TenantLayout;
