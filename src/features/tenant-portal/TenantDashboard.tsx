import React from 'react';
import { Typography, Card, Row, Col, Table, Tag, Skeleton, Statistic, Alert, Button, Space } from 'antd';
import { FileTextOutlined, DollarOutlined, HomeOutlined, CreditCardOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tenantPortalApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatDate, formatMoney } from '../../lib/format';
import { CONTRACT_STATUS_MAP, INVOICE_STATUS_MAP } from '../../lib/constants';
import type { Contract, Invoice, ContractStatus, InvoiceStatus, AccessCard } from '../../types/models';

const { Title, Text } = Typography;

const TenantDashboard: React.FC = () => {
  const { user } = useAuthStore();

  const { data: contracts, isLoading: cLoading } = useQuery<Contract[]>({
    queryKey: ['tenant-contracts'],
    queryFn: () => tenantPortalApi.myContracts(),
  });

  const { data: invoices, isLoading: iLoading } = useQuery<Invoice[]>({
    queryKey: ['tenant-invoices'],
    queryFn: () => tenantPortalApi.myInvoices(),
  });

  const { data: cards } = useQuery<AccessCard[]>({
    queryKey: ['tenant-cards'],
    queryFn: () => tenantPortalApi.myAccessCards(),
  });

  const isLoading = cLoading || iLoading;

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  const activeContracts = (contracts || []).filter((c) => c.status === 'active').length;
  const unpaidInvoices = (invoices || []).filter((i) => i.status === 'pending' || i.status === 'overdue');
  const pendingInvoices = unpaidInvoices.length;
  const totalDebt = unpaidInvoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);

  const contractColumns = [
    { title: '№', dataIndex: 'contractNumber', key: 'num', render: (n: string, r: Contract) => <Link to={`/my/contracts/${r.id}`}>{n}</Link> },
    { title: 'Помещение', dataIndex: ['unit', 'unitNumber'], key: 'unit' },
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

  const invoiceColumns = [
    { title: '№', dataIndex: 'invoiceNumber', key: 'num', render: (n: string) => <Link to="/my/invoices">{n}</Link> },
    { title: 'Сумма', dataIndex: 'totalAmount', key: 'amount', render: (v: number) => formatMoney(v) },
    { title: 'Срок', dataIndex: 'dueDate', key: 'due', render: (d: string) => formatDate(d) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: InvoiceStatus) => {
        const m = INVOICE_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>
        Добро пожаловать{user?.fullName ? `, ${user.fullName}` : ''}!
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>Личный кабинет арендатора</Text>

      {activeContracts === 0 && (contracts || []).length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
          message="Начните работу с NGRent"
          description={
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                <Link to="/my/units"><Button type="primary" size="small">Посмотреть помещения</Button></Link>
                <Link to="/my/applications"><Button size="small">Мои заявки</Button></Link>
                <Link to="/my/profile"><Button size="small">Заполнить профиль</Button></Link>
              </Space>
            </div>
          }
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Активные договоры" value={activeContracts} prefix={<FileTextOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="К оплате" value={totalDebt > 0 ? formatMoney(totalDebt) : '0 ₽'} prefix={<DollarOutlined />} valueStyle={{ color: totalDebt > 0 ? '#ff4d4f' : '#52c41a' }} suffix={pendingInvoices > 0 ? <span style={{ fontSize: 12, color: '#999' }}> ({pendingInvoices} сч.)</span> : undefined} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Помещений" value={(contracts || []).length} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Карт доступа" value={(cards || []).filter((c) => c.isActive).length} prefix={<CreditCardOutlined />} /></Card>
        </Col>
      </Row>

      {(() => {
        const upcoming = unpaidInvoices
          .filter((i) => i.dueDate)
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        const nearest = upcoming[0];
        if (!nearest) return null;
        return (
          <Alert
            style={{ marginBottom: 24 }}
            type="warning"
            showIcon
            message={`Ближайшая оплата: ${formatDate(nearest.dueDate)} — ${formatMoney(nearest.totalAmount)}`}
          />
        );
      })()}

      {(() => {
        const expiring = (contracts || [])
          .filter((c: any) => c.status === 'active' && c.endDate)
          .map((c: any) => ({ ...c, daysLeft: Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) }))
          .filter((c: any) => c.daysLeft <= 30 && c.daysLeft >= 0)
          .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
        if (!expiring.length) return null;
        return (
          <Alert
            style={{ marginBottom: 24 }}
            type={expiring[0].daysLeft <= 7 ? 'error' : 'info'}
            showIcon
            message={`Договор ${expiring[0].contractNumber} истекает через ${expiring[0].daysLeft} дн. (${formatDate(expiring[0].endDate)})`}
          />
        );
      })()}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Мои договоры">
            <Table columns={contractColumns} dataSource={contracts || []} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Последние счета">
            <Table columns={invoiceColumns} dataSource={(invoices || []).slice(0, 10)} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Title level={5} style={{ marginBottom: 12 }}>Быстрые действия</Title>
        <Space wrap size={[8, 8]}>
          <Link to="/my/units"><Button>Посмотреть помещения</Button></Link>
          <Link to="/my/invoices"><Button>Все счета</Button></Link>
          <Link to="/my/maintenance"><Button>Заявка на обслуживание</Button></Link>
          <Link to="/my/tickets"><Button>Обратиться в поддержку</Button></Link>
          <Link to="/my/documents"><Button>Документы</Button></Link>
          <Link to="/my/access-cards"><Button>Мои пропуска</Button></Link>
        </Space>
      </Card>
    </div>
  );
};

export default TenantDashboard;
