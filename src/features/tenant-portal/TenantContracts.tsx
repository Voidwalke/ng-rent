import React from 'react';
import { Typography, Table, Tag, Skeleton, Empty, Row, Col, Card, Statistic, Alert, Button, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tenantPortalApi } from '../../api/endpoints';
import { formatDate, formatMoney } from '../../lib/format';
import { CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { Contract, ContractStatus } from '../../types/models';

const { Title } = Typography;

const TenantContracts: React.FC = () => {
  const { data, isLoading } = useQuery<Contract[]>({
    queryKey: ['tenant-contracts'],
    queryFn: () => tenantPortalApi.myContracts(),
  });

  const columns = [
    { title: '№', dataIndex: 'contractNumber', key: 'num', render: (n: string, r: Contract) => <Link to={`/my/contracts/${r.id}`}>{n}</Link> },
    {
      title: 'Объект / Помещение', key: 'unit',
      render: (_: unknown, r: Contract) => {
        const prop = (r as any).unit?.property?.name || '';
        const unit = (r as any).unit?.unitNumber || '';
        return <span>{prop}{unit ? ` · ${unit}` : ''}</span>;
      },
    },
    { title: 'Аренда/мес', dataIndex: 'monthlyRent', key: 'rent', render: (v: number) => formatMoney(v) },
    { title: 'Окончание', dataIndex: 'endDate', key: 'end', render: (d: string) => formatDate(d) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ContractStatus) => {
        const m = CONTRACT_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
  ];

  const contracts = data || [];
  const activeCount = contracts.filter((c) => ['signed', 'active'].includes(c.status)).length;
  const now = Date.now();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;
  const expiringCount = contracts.filter((c) => {
    const end = new Date(c.endDate).getTime();
    return ['signed', 'active'].includes(c.status) && end > now && end - now <= sixtyDays;
  }).length;

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Мои договоры</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}><Card size="small"><Statistic title="Всего договоров" value={contracts.length} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Активных" value={activeCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Истекают скоро" value={expiringCount} valueStyle={{ color: expiringCount > 0 ? '#faad14' : undefined }} /></Card></Col>
      </Row>

      {(() => {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        const expiringSoon = contracts.filter((c) => {
          const end = new Date(c.endDate).getTime();
          return ['signed', 'active'].includes(c.status) && end > now && end - now <= thirtyDays;
        });
        return expiringSoon.map((c) => {
          const days = Math.ceil((new Date(c.endDate).getTime() - now) / (24 * 60 * 60 * 1000));
          return (
            <Alert
              key={c.id}
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`Договор ${c.contractNumber} истекает через ${days} дн. — обратитесь к арендодателю для продления`}
            />
          );
        });
      })()}

      <Table columns={columns} dataSource={contracts} rowKey="id" pagination={{ pageSize: 20 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="У вас пока нет договоров" /> }} />

      <Card size="small" style={{ marginTop: 16 }} title="Быстрые действия">
        <Space wrap>
          <Link to="/my/invoices"><Button>Мои счета</Button></Link>
          <Link to="/my/maintenance"><Button>Заявка на обслуживание</Button></Link>
          <Link to="/my/tickets"><Button>Поддержка</Button></Link>
        </Space>
      </Card>
    </div>
  );
};

export default TenantContracts;
