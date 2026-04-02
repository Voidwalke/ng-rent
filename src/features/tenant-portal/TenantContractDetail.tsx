import React, { useState } from 'react';
import { Typography, Card, Descriptions, Tag, Button, Space, Skeleton, Modal, Row, Col, Statistic, App } from 'antd';
import { CheckCircleOutlined, FilePdfOutlined, DollarOutlined, ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantPortalApi } from '../../api/endpoints';
import api from '../../api/client';
import { formatDate, formatMoney, formatArea } from '../../lib/format';
import { CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { Contract, ContractStatus, Invoice } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const TenantContractDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: contract, isLoading } = useQuery<Contract>({
    queryKey: ['tenant-contract', id],
    queryFn: () => tenantPortalApi.getContract(Number(id)),
    enabled: !!id,
  });

  usePageTitle(contract ? `Договор ${contract.contractNumber}` : 'Договор');

  const acceptMutation = useMutation({
    mutationFn: () => tenantPortalApi.acceptContract(Number(id)),
    onSuccess: () => {
      message.success('Договор успешно принят');
      queryClient.invalidateQueries({ queryKey: ['tenant-contract', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-contracts'] });
      setConfirmOpen(false);
    },
    onError: () => {
      message.error('Не удалось принять договор');
    },
  });

  const downloadContractPdf = async () => {
    try {
      message.loading({ content: 'Генерация документа...', key: 'pdf-download', duration: 0 });
      const response = await api.get(`/contracts/${id}/pdf`, { responseType: 'blob', timeout: 120_000 });
      message.destroy('pdf-download');
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `contract-${contract?.contractNumber || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 500);
    } catch {
      message.destroy('pdf-download');
      message.error('Ошибка генерации документа');
    }
  };

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!contract) return null;

  const statusInfo = CONTRACT_STATUS_MAP[contract.status as ContractStatus];
  const canAccept = contract.status === 'draft' || contract.status === 'sent';

  return (
    <div>
      <PageBreadcrumb items={[
        { title: 'Мои помещения', path: '/my/rented' },
        ...(contract.unit?.property ? [{ title: contract.unit.property.name }] : []),
        ...(contract.unit ? [{ title: contract.unit.unitNumber || `Помещение` }] : []),
        { title: contract.contractNumber },
      ]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>
          Договор {contract.contractNumber} <Tag color={statusInfo?.color || 'default'}>{statusInfo?.label || contract.status}</Tag>
        </Title>
        <Button icon={<FilePdfOutlined />} onClick={downloadContractPdf}>Скачать договор PDF</Button>
      </div>

      <Card title="Основные данные" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Номер">{contract.contractNumber}</Descriptions.Item>
          <Descriptions.Item label="Начало">{formatDate(contract.startDate)}</Descriptions.Item>
          <Descriptions.Item label="Окончание">{formatDate(contract.endDate)}</Descriptions.Item>
          <Descriptions.Item label="Аренда/мес">{formatMoney(contract.monthlyRent)}</Descriptions.Item>
          <Descriptions.Item label="Депозит">{contract.depositAmount ? formatMoney(contract.depositAmount) : '—'}</Descriptions.Item>
          <Descriptions.Item label="День оплаты">{contract.paymentDay}-е число</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Помещение" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Объект">{contract.unit?.property?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Номер">{contract.unit?.unitNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Площадь">{contract.unit ? formatArea(contract.unit.areaSqm) : '—'}</Descriptions.Item>
          <Descriptions.Item label="Этаж">{contract.unit?.floor ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Арендодатель */}
      {contract.unit?.property && (
        <Card title="Арендодатель" size="small" style={{ marginBottom: 16 }}>
          <Text>{contract.unit.property.name || '—'}</Text>
          {(contract as any).unit?.property?.tenant?.name && (
            <Text type="secondary" style={{ display: 'block' }}>УК: {(contract as any).unit.property.tenant.name}</Text>
          )}
        </Card>
      )}

      {/* Финансы */}
      {(contract as any).invoices && (contract as any).invoices.length > 0 && (() => {
        const invoices = (contract as any).invoices as Invoice[];
        const totalBilled = invoices.reduce((s: number, i: Invoice) => s + Number(i.totalAmount || 0), 0);
        const totalPaid = invoices.filter((i: Invoice) => i.status === 'paid').reduce((s: number, i: Invoice) => s + Number(i.totalAmount || 0), 0);
        const outstanding = totalBilled - totalPaid;
        const overdueCount = invoices.filter((i: Invoice) => i.status === 'overdue').length;
        return (
          <Card title="Финансы" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 8]}>
              <Col xs={12} sm={6}><Statistic title="Начислено" value={formatMoney(totalBilled)} valueStyle={{ fontSize: 16 }} /></Col>
              <Col xs={12} sm={6}><Statistic title="Оплачено" value={formatMoney(totalPaid)} valueStyle={{ fontSize: 16, color: '#52c41a' }} /></Col>
              <Col xs={12} sm={6}><Statistic title="К оплате" value={formatMoney(outstanding)} valueStyle={{ fontSize: 16, color: outstanding > 0 ? '#faad14' : undefined }} /></Col>
              <Col xs={12} sm={6}><Statistic title="Просрочено" value={overdueCount} valueStyle={{ fontSize: 16, color: overdueCount > 0 ? '#ff4d4f' : undefined }} /></Col>
            </Row>
          </Card>
        );
      })()}

      {canAccept && (
        <Card>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={() => setConfirmOpen(true)}
            loading={acceptMutation.isPending}
          >
            Принять договор
          </Button>
        </Card>
      )}

      <Modal
        title="Подтверждение принятия договора"
        open={confirmOpen}
        onOk={() => acceptMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
        okText="Подтвердить"
        cancelText="Отмена"
        confirmLoading={acceptMutation.isPending}
      >
        <p>
          Вы подтверждаете условия договора №{contract.contractNumber}?
        </p>
        <p style={{ color: '#888', fontSize: 13 }}>
          После подтверждения администратор получит уведомление и сможет активировать договор.
        </p>
      </Modal>
    </div>
  );
};

export default TenantContractDetail;
