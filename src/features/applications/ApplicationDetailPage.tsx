import React, { useState } from 'react';
import { Typography, Card, Descriptions, Tag, Button, Space, Skeleton, Modal, Input, Tooltip, message, Steps } from 'antd';
import { CheckOutlined, CloseOutlined, FileTextOutlined, SearchOutlined, InfoCircleOutlined } from '@ant-design/icons';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { applicationsApi, contractsApi } from '../../api/endpoints';
import { formatDate, formatMoney, formatArea } from '../../lib/format';
import { APPLICATION_STATUS_MAP } from '../../lib/constants';
import type { Application, ApplicationStatus } from '../../types/models';

const { Title, Text } = Typography;

const STATUS_ORDER: ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'contract_sent', 'signed', 'active'];

const ApplicationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: app, isLoading } = useQuery<Application>({
    queryKey: ['application', id],
    queryFn: () => applicationsApi.get(Number(id)),
    enabled: !!id,
  });

  const reviewMutation = useMutation({
    mutationFn: () => applicationsApi.review(Number(id)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['application', id] }); message.success('Заявка взята на рассмотрение'); },
    onError: () => message.error('Ошибка'),
  });

  const approveMutation = useMutation({
    mutationFn: () => applicationsApi.approve(Number(id)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['application', id] }); message.success('Заявка одобрена'); },
    onError: () => message.error('Ошибка'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => applicationsApi.reject(Number(id), reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['application', id] }); setRejectModal(false); message.success('Заявка отклонена'); },
    onError: () => message.error('Ошибка'),
  });

  const generateContractMutation = useMutation({
    mutationFn: () => contractsApi.generate(Number(id)),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['application', id] });
      message.success('Договор сформирован — переход к договору...');
      const cid = data?.id || data?.data?.id;
      if (cid) setTimeout(() => navigate(`/contracts/${cid}`), 1500);
    },
    onError: () => message.error('Ошибка генерации договора'),
  });

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!app) return null;

  const statusInfo = APPLICATION_STATUS_MAP[app.status];
  const currentStep = STATUS_ORDER.indexOf(app.status);

  return (
    <div>
      <PageBreadcrumb items={[
        { title: 'Объекты', path: '/properties' },
        ...(app.unit?.property ? [{ title: app.unit.property.name, path: `/properties/${app.unit.propertyId}` }] : []),
        ...(app.unit ? [{ title: app.unit.unitNumber || `Помещение #${app.unitId}`, path: `/units/${app.unitId}` }] : []),
        { title: `Заявка #${id}` },
      ]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>Заявка #{app.id}</Title>
          <Tag color={statusInfo?.color || 'default'}>{statusInfo?.label || app.status}</Tag>
        </Space>
        <Space>
          {app.status === 'submitted' && (
            <Button icon={<SearchOutlined />} onClick={() => reviewMutation.mutate()} loading={reviewMutation.isPending}>
              Взять на рассмотрение
            </Button>
          )}
          {app.status === 'under_review' && (
            <>
              <Tooltip title="После одобрения помещение будет зарезервировано для арендатора">
                <Button type="primary" icon={<CheckOutlined />} onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
                  Одобрить <InfoCircleOutlined style={{ marginLeft: 4, opacity: 0.6 }} />
                </Button>
              </Tooltip>
              <Button danger icon={<CloseOutlined />} onClick={() => setRejectModal(true)}>
                Отклонить
              </Button>
            </>
          )}
          {app.status === 'approved' && (
            <Button type="primary" icon={<FileTextOutlined />} onClick={() => generateContractMutation.mutate()} loading={generateContractMutation.isPending}>
              Сформировать договор
            </Button>
          )}
        </Space>
      </div>

      {app.status !== 'rejected' && (
        <Card style={{ marginBottom: 16 }}>
          <Steps
            current={currentStep >= 0 ? currentStep : 0}
            items={STATUS_ORDER.map((s) => {
              const m = APPLICATION_STATUS_MAP[s];
              return { title: m?.label || s };
            })}
            size="small"
          />
        </Card>
      )}

      <Card title="Информация о клиенте" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Компания">{app.client?.companyName || '—'}</Descriptions.Item>
          <Descriptions.Item label="ИНН">{app.client?.inn || '—'}</Descriptions.Item>
          <Descriptions.Item label="Контакт">{app.client?.contactName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{app.client?.contactEmail || '—'}</Descriptions.Item>
          <Descriptions.Item label="Телефон">{app.client?.contactPhone || '—'}</Descriptions.Item>
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

      <Modal
        title="Причина отклонения"
        open={rejectModal}
        onOk={() => rejectMutation.mutate(rejectReason)}
        onCancel={() => setRejectModal(false)}
        confirmLoading={rejectMutation.isPending}
        okText="Отклонить"
        okButtonProps={{ danger: true }}
        cancelText="Отмена"
      >
        <Input.TextArea
          rows={3}
          placeholder="Укажите причину отклонения..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default ApplicationDetailPage;
