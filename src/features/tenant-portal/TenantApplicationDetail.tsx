import React from 'react';
import { Typography, Card, Descriptions, Tag, Skeleton, Alert } from 'antd';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tenantPortalApi } from '../../api/endpoints';
import { formatDate, formatMoney, formatArea } from '../../lib/format';
import { APPLICATION_STATUS_MAP } from '../../lib/constants';
import type { Application } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const TenantApplicationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: app, isLoading } = useQuery<Application>({
    queryKey: ['tenant-application', id],
    queryFn: () => tenantPortalApi.getApplication(Number(id)),
    enabled: !!id,
  });

  usePageTitle(app ? `Заявка #${app.id}` : 'Заявка');

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!app) return null;

  const statusInfo = APPLICATION_STATUS_MAP[app.status];

  return (
    <div>
      <PageBreadcrumb items={[
        { title: 'Мои заявки', path: '/my/applications' },
        ...(app.unit?.property ? [{ title: app.unit.property.name }] : []),
        ...(app.unit ? [{ title: app.unit.unitNumber || 'Помещение' }] : []),
        { title: `Заявка #${app.id}` },
      ]} />

      <Title level={3} style={{ marginBottom: 16 }}>
        Заявка #{app.id} <Tag color={statusInfo?.color || 'default'}>{statusInfo?.label || app.status}</Tag>
      </Title>

      {app.status === 'submitted' && (
        <Alert type="info" showIcon message="Заявка отправлена и ожидает рассмотрения. Обычно ответ приходит в течение 1-3 рабочих дней." style={{ marginBottom: 16 }} />
      )}
      {app.status === 'under_review' && (
        <Alert type="info" showIcon message="Заявка находится на рассмотрении у менеджера." style={{ marginBottom: 16 }} />
      )}
      {app.status === 'approved' && (
        <Alert type="success" showIcon message="Заявка одобрена! Договор будет сформирован в ближайшее время." style={{ marginBottom: 16 }} />
      )}
      {app.status === 'rejected' && (
        <Alert type="error" showIcon message={app.rejectionReason || 'Заявка отклонена.'} style={{ marginBottom: 16 }} />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Дата подачи">{formatDate(app.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="Дней в обработке">{Math.floor((Date.now() - new Date(app.createdAt).getTime()) / 86400000)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Помещение" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Объект">{app.unit?.property?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Номер">{app.unit?.unitNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Этаж">{app.unit?.floor ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Площадь">{app.unit ? formatArea(app.unit.areaSqm) : '—'}</Descriptions.Item>
          <Descriptions.Item label="Цена/мес">{app.unit ? formatMoney(app.unit.priceMonth) : '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Детали заявки">
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Желаемое начало">{formatDate(app.desiredStart)}</Descriptions.Item>
          <Descriptions.Item label="Желаемое окончание">{formatDate(app.desiredEnd)}</Descriptions.Item>
          <Descriptions.Item label="Желаемая цена">{app.desiredPrice ? formatMoney(app.desiredPrice) : '—'}</Descriptions.Item>
          <Descriptions.Item label="Создана">{formatDate(app.createdAt)}</Descriptions.Item>
          {app.comment && <Descriptions.Item label="Комментарий" span={2}>{app.comment}</Descriptions.Item>}
          {app.rejectionReason && <Descriptions.Item label="Причина отказа" span={2}><Text type="danger">{app.rejectionReason}</Text></Descriptions.Item>}
        </Descriptions>
      </Card>
    </div>
  );
};

export default TenantApplicationDetail;
