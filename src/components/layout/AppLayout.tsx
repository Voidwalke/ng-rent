import React, { useState, useEffect, useRef } from 'react';
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
  DashboardOutlined,
  HomeOutlined,
  BankOutlined,
  AppstoreOutlined,
  TeamOutlined,
  FileTextOutlined,
  AuditOutlined,
  DollarOutlined,
  KeyOutlined,
  BellOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  QuestionCircleOutlined,
  ToolOutlined,
  ImportOutlined,
  BarChartOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/auth';
import { useNotificationsStore } from '../../store/notifications';
import { useThemeStore } from '../../store/theme';
import CommandPalette from '../CommandPalette';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const AppLayout: React.FC = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [collapsed, setCollapsed] = useState(isMobile);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasRole } = useAuthStore();
  const { unreadCount, fetchUnreadCount } = useNotificationsStore();
  const { isDark, toggle } = useThemeStore();
  const { token } = theme.useToken();
  const { notification } = AntApp.useApp();
  const prevUnreadCount = useRef<number>(0);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
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

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = hasRole('admin', 'super_admin');
  const isManager = hasRole('admin', 'manager', 'super_admin');
  const isTenantRole = user?.role === 'tenant';

  const menuItems = isSuperAdmin ? [
    {
      key: '/superadmin',
      icon: <DashboardOutlined />,
      label: 'Управление',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
    },
  ] : [
    // === Все роли ===
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Дашборд',
    },
    // === Только manager+ ===
    ...(isManager ? [
      {
        key: '/properties',
        icon: <BankOutlined />,
        label: 'Объекты',
      },
      {
        key: '/units',
        icon: <AppstoreOutlined />,
        label: 'Помещения',
      },
      {
        key: '/clients',
        icon: <TeamOutlined />,
        label: 'Арендаторы',
      },
      {
        key: '/applications',
        icon: <FileTextOutlined />,
        label: 'Заявки',
      },
    ] : []),
    // === admin + manager ===
    {
      key: '/contracts',
      icon: <AuditOutlined />,
      label: 'Договоры',
    },
    {
      key: '/invoices',
      icon: <DollarOutlined />,
      label: 'Счета',
    },
    // === Только manager+ ===
    ...(isManager ? [
      {
        key: '/access-cards',
        icon: <KeyOutlined />,
        label: 'СКУД',
      },
      {
        key: '/maintenance',
        icon: <ToolOutlined />,
        label: 'Обслуживание',
      },
    ] : []),
    // === Аналитика — все роли ===
    {
      key: '/analytics',
      icon: <BarChartOutlined />,
      label: 'Аналитика',
    },
    // === Только admin ===
    ...(isAdmin ? [
      {
        key: '/import',
        icon: <ImportOutlined />,
        label: 'Импорт',
      },
    ] : []),
    {
      key: 'rent-portal',
      icon: <HomeOutlined />,
      label: 'Аренда помещений',
    },
    {
      key: '/support',
      icon: <QuestionCircleOutlined />,
      label: 'Поддержка',
    },
    {
      key: '/help',
      icon: <QuestionCircleOutlined />,
      label: 'Помощь',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
    },
  ];

  const profileMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: 'Профиль',
        onClick: () => navigate('/settings'),
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Настройки',
        onClick: () => navigate('/settings'),
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

  const selectedKey = '/' + location.pathname.split('/')[1];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="md"
        theme="light"
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        }}
        width={240}
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
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Text strong style={{ fontSize: collapsed ? 16 : 20, color: '#2563eb' }}>
              {collapsed ? 'NG' : 'NGRent'}
            </Text>
          </Link>
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => {
            if (key === 'rent-portal') { window.open('/my', '_blank'); return; }
            navigate(key);
          }}
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
              onClick={() => navigate('/notifications')}
            />
          </Badge>

          <Dropdown menu={profileMenu} trigger={['click']}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
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
        <CommandPalette />
      </Layout>
    </Layout>
  );
};

export default AppLayout;
