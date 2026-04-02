import React from 'react';
import { Typography, Table, Button, Tag, Skeleton, Empty, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tenantPortalApi } from '../../api/endpoints';
import { formatDate } from '../../lib/format';
import { APPLICATION_STATUS_MAP } from '../../lib/constants';
import type { Application, ApplicationStatus } from '../../types/models';

const { Title } = Typography;

const TenantApplications: React.FC = () => {
  const { data, isLoading } = useQuery<Application[]>({
    queryKey: ['tenant-applications'],
    queryFn: () => tenantPortalApi.myApplications(),
  });

  const columns = [
    { title: '№', dataIndex: 'id', key: 'id', render: (id: number) => <Link to={`/my/applications/${id}`}>#{id}</Link> },
    { title: 'Помещение', key: 'unit', render: (_: unknown, r: Application) => r.unit?.unitNumber || '—' },
    { title: 'Начало', dataIndex: 'desiredStart', key: 'start', render: (d: string) => formatDate(d) },
    { title: 'Окончание', dataIndex: 'desiredEnd', key: 'end', render: (d: string) => formatDate(d) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ApplicationStatus) => {
        const m = APPLICATION_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    { title: 'Создана', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    { title: 'Причина отказа', dataIndex: 'rejectionReason', key: 'reason', render: (v: string, r: Application) => r.status === 'rejected' && v ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '—' },
  ];

  const applications = data || [];
  const totalCount = applications.length;
  const pendingCount = applications.filter((a) => ['submitted', 'under_review'].includes(a.status)).length;
  const approvedCount = applications.filter((a) => a.status === 'approved').length;
  const rejectedCount = applications.filter((a) => a.status === 'rejected').length;

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Мои заявки</Title>
        <Link to="/catalog">
          <Button type="primary" icon={<PlusOutlined />}>Подать заявку</Button>
        </Link>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Всего" value={totalCount} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="На рассмотрении" value={pendingCount} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Одобрено" value={approvedCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Отклонено" value={rejectedCount} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Table columns={columns} dataSource={applications} rowKey="id" pagination={{ pageSize: 20 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="У вас пока нет заявок" /> }} />
    </div>
  );
};

export default TenantApplications;
