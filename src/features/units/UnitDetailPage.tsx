import React from 'react';
import { Typography, Card, Descriptions, Tag, Table, Button, Skeleton, Space, Divider } from 'antd';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { unitsApi } from '../../api/endpoints';
import { formatArea, formatMoney, formatDate } from '../../lib/format';
import { UNIT_STATUS_MAP, CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { Unit, UnitStatus, Contract, ContractStatus } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const UnitDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: unit, isLoading } = useQuery<Unit>({
    queryKey: ['unit-detail', id],
    queryFn: () => unitsApi.get(Number(id)),
    enabled: !!id,
  });

  usePageTitle(unit ? `Помещение ${unit.unitNumber}` : 'Помещение');

  // Договоры для этого помещения приходят из API детализации (включает связь contracts)
  const unitContracts = (unit as any)?.contracts || [];

  // Текущий активный договор определяет текущего арендатора
  const activeContract = React.useMemo(() => {
    return unitContracts.find((c) => c.status === 'active' || c.status === 'signed');
  }, [unitContracts]);

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (!unit) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Title level={4}>Помещение не найдено</Title>
        <Button onClick={() => navigate('/units')}>Вернуться к списку</Button>
      </div>
    );
  }

  const statusInfo = UNIT_STATUS_MAP[unit.status] || { label: unit.status, color: 'default' };

  const contractColumns = [
    {
      title: '№ договора', dataIndex: 'contractNumber', key: 'num',
      render: (v: string, r: Contract) => <Link to={`/contracts/${r.id}`}>{v}</Link>,
    },
    {
      title: 'Клиент', key: 'client',
      render: (_: unknown, r: Contract) => r.client?.companyName || `ID ${r.clientId}`,
    },
    { title: 'Начало', dataIndex: 'startDate', key: 'start', render: (d: string) => formatDate(d) },
    { title: 'Окончание', dataIndex: 'endDate', key: 'end', render: (d: string) => formatDate(d) },
    { title: 'Аренда/мес', dataIndex: 'monthlyRent', key: 'rent', render: (v: number) => formatMoney(v) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ContractStatus) => {
        const m = CONTRACT_STATUS_MAP[s] || { label: s, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
  ];

  return (
    <div>
      <PageBreadcrumb items={[
        { title: 'Объекты', path: '/properties' },
        ...(unit.property ? [{ title: unit.property.name, path: `/properties/${unit.propertyId}` }] : []),
        { title: unit.unitNumber || `#${id}` },
      ]} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          Помещение {unit.unitNumber || `#${unit.id}`}
        </Title>
        <Tag color={statusInfo.color} style={{ fontSize: 14, padding: '2px 12px' }}>
          {statusInfo.label}
        </Tag>
      </div>

      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        {/* Информация о помещении */}
        <Card title="Информация о помещении">
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
            <Descriptions.Item label="Номер">{unit.unitNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Этаж">{unit.floor}</Descriptions.Item>
            <Descriptions.Item label="Площадь">{formatArea(unit.areaSqm)}</Descriptions.Item>
            <Descriptions.Item label="Цена/мес">{formatMoney(unit.priceMonth)}</Descriptions.Item>
            <Descriptions.Item label="Статус">
              <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Создано">{formatDate(unit.createdAt)}</Descriptions.Item>
            {unit.description && (
              <Descriptions.Item label="Описание" span={3}>{unit.description}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* Информация об объекте */}
        {unit.property && (
          <Card title="Объект недвижимости">
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="Название">
                <Link to={`/properties/${unit.propertyId}`}>{unit.property.name}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="Адрес">{unit.property.address || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {/* Текущий арендатор */}
        {activeContract && (
          <Card title="Текущий арендатор">
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="Компания">
                {activeContract.client?.companyName || `Клиент #${activeContract.clientId}`}
              </Descriptions.Item>
              <Descriptions.Item label="Договор">
                <Link to={`/contracts/${activeContract.id}`}>{activeContract.contractNumber}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="Период аренды">
                {formatDate(activeContract.startDate)} — {formatDate(activeContract.endDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Аренда/мес">{formatMoney(activeContract.monthlyRent)}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {/* История аренды */}
        <Card title="История аренды">
          <Table
            columns={contractColumns}
            dataSource={unitContracts}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            locale={{ emptyText: 'Нет договоров для данного помещения' }}
            size="small"
          />
        </Card>
      </Space>
    </div>
  );
};

export default UnitDetailPage;
