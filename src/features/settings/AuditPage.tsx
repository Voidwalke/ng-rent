import React, { useState } from 'react';
import { Typography, Table, Tag, Select, Space, Card, theme } from 'antd';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../api/endpoints';
import { formatDateTime } from '../../lib/format';
import type { ActivityEvent } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title } = Typography;

const ACTION_MAP: Record<string, { label: string; color: string }> = {
  POST: { label: 'Создание', color: 'green' },
  PATCH: { label: 'Изменение', color: 'blue' },
  DELETE: { label: 'Удаление', color: 'red' },
  PUT: { label: 'Обновление', color: 'orange' },
};

const ENTITY_MAP: Record<string, string> = {
  properties: 'Объект',
  units: 'Помещение',
  clients: 'Клиент',
  applications: 'Заявка',
  contracts: 'Договор',
  invoices: 'Счёт',
  payments: 'Платёж',
  'access-cards': 'Карта СКУД',
  maintenance: 'Обслуживание',
  'support/tickets': 'Тикет',
  tenants: 'Организация',
  users: 'Пользователь',
  auth: 'Авторизация',
};

const AuditPage: React.FC = () => {
  usePageTitle('Аудит');
  const { token } = theme.useToken();
  const [actionFilter, setActionFilter] = useState<string | undefined>();

  const { data, isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ['audit-activity'],
    queryFn: () => dashboardApi.activity(200),
  });

  const filtered = React.useMemo(() => {
    let items = data || [];
    if (actionFilter) items = items.filter((e) => e.action === actionFilter);
    return items;
  }, [data, actionFilter]);

  const columns = [
    {
      title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 160,
      render: (d: string) => formatDateTime(d),
    },
    {
      title: 'Пользователь', key: 'user', width: 180,
      render: (_: unknown, r: ActivityEvent) => r.user?.fullName || 'Система',
    },
    {
      title: 'Действие', dataIndex: 'action', key: 'action', width: 120,
      render: (a: string) => {
        const m = ACTION_MAP[a];
        return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{a}</Tag>;
      },
    },
    {
      title: 'Объект', key: 'entity', width: 150,
      render: (_: unknown, r: ActivityEvent) => {
        const label = ENTITY_MAP[r.entityType] || r.entityType;
        return `${label} #${r.entityId}`;
      },
    },
    {
      title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true,
      render: (u: string) => <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{u}</span>,
    },
  ];

  return (
    <div>
      <PageBreadcrumb items={[{ title: 'Настройки', path: '/settings' }, { title: 'Журнал событий' }]} />
      <Title level={3} style={{ marginBottom: 16 }}>Журнал событий</Title>

      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Тип действия"
          allowClear
          value={actionFilter}
          onChange={setActionFilter}
          style={{ width: 200 }}
          options={[
            { value: 'POST', label: 'Создание' },
            { value: 'PATCH', label: 'Изменение' },
            { value: 'DELETE', label: 'Удаление' },
          ]}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Нет записей' }}
      />
    </div>
  );
};

export default AuditPage;
