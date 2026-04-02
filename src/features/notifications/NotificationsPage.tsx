import React from 'react';
import { Typography, List, Button, Tag, Skeleton, Space, message, theme } from 'antd';
import { CheckOutlined, BellOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/endpoints';
import { formatDateTime, timeAgo } from '../../lib/format';
import type { Notification } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';

const { Title, Text } = Typography;

const NotificationsPage: React.FC = () => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<Notification>>({
    queryKey: ['notifications', page],
    queryFn: () => notificationsApi.list({ limit: 20, page }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); message.success('Все уведомления прочитаны'); },
  });

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  const notifications = data?.data || [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>Уведомления</Title>
          {unreadCount > 0 && <Tag color="blue">{unreadCount} новых</Tag>}
        </Space>
        {unreadCount > 0 && (
          <Button icon={<CheckOutlined />} onClick={() => markAllReadMutation.mutate()} loading={markAllReadMutation.isPending}>
            Прочитать все
          </Button>
        )}
      </div>

      <List
        dataSource={notifications}
        loading={isLoading}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }}
        locale={{ emptyText: 'Нет уведомлений' }}
        renderItem={(item: Notification) => (
          <List.Item
            style={{
              background: item.isRead ? token.colorBgContainer : token.colorPrimaryBg,
              padding: '12px 16px',
              marginBottom: 4,
              borderRadius: 8,
              border: item.isRead ? `1px solid ${token.colorBorderSecondary}` : `1px solid ${token.colorPrimaryBorder}`,
            }}
            actions={
              !item.isRead ? [
                <Button
                  key="read"
                  size="small"
                  type="link"
                  onClick={() => markReadMutation.mutate(item.id)}
                >
                  Прочитано
                </Button>,
              ] : undefined
            }
          >
            <List.Item.Meta
              avatar={<BellOutlined style={{ fontSize: 18, color: item.isRead ? token.colorTextQuaternary : '#2563eb' }} />}
              title={
                <Space>
                  <Text strong={!item.isRead}>{item.title}</Text>
                  {!item.isRead && <Tag color="blue" style={{ fontSize: 10 }}>Новое</Tag>}
                </Space>
              }
              description={
                <div>
                  <Text type="secondary">{item.message}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{timeAgo(item.createdAt)}</Text>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
};

export default NotificationsPage;
