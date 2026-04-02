import React, { useState } from 'react';
import { Typography, Table, Button, Tag, Skeleton, Drawer, Descriptions, Divider, Empty, message, Row, Col, Card, Statistic } from 'antd';
import { EyeOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantPortalApi, paymentsApi, invoicesApi } from '../../api/endpoints';
import api from '../../api/client';
import { formatDate, formatMoney } from '../../lib/format';
import { INVOICE_STATUS_MAP } from '../../lib/constants';
import type { Invoice, InvoiceStatus } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const TenantInvoices: React.FC = () => {
  usePageTitle('Мои счета');
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);

  const { data, isLoading } = useQuery<Invoice[]>({
    queryKey: ['tenant-invoices'],
    queryFn: () => tenantPortalApi.myInvoices(),
  });

  const payMutation = useMutation({
    mutationFn: async (id: number) => {
      return tenantPortalApi.payInvoice(id);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-invoices'] });
      if (res.confirmationUrl) {
        message.loading('Переход к оплате...');
        window.open(res.confirmationUrl, '_blank');
        // Опрос статуса платежа, т.к. вебхук может не дойти до localhost
        message.info('После оплаты статус обновится автоматически');
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ['tenant-invoices'] });
        }, 5000);
        setTimeout(() => clearInterval(pollInterval), 120000); // остановка через 2 мин
      } else {
        message.success('Платёж проведён');
      }
    },
    onError: () => message.error('Ошибка оплаты'),
  });

  const openDetail = async (invoice: Invoice) => {
    setSelected(invoice);
    setDrawerOpen(true);
    try {
      const detail = await tenantPortalApi.getInvoice(invoice.id);
      setInvoiceDetail(detail);
    } catch { setInvoiceDetail(null); }
  };

  const handleDownloadPdf = async (invoiceId: number, invoiceNumber: string) => {
    try {
      const response = await api.get(`/invoices/${invoiceId}/document`, { responseType: 'blob', timeout: 120000 });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
    } catch { message.error('Ошибка скачивания'); }
  };

  const columns = [
    {
      title: 'Счёт', key: 'info',
      render: (_: unknown, r: Invoice) => {
        const period = r.periodStart ? new Date(r.periodStart).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) : '';
        const contract = (r as any).contract?.contractNumber || '';
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{r.invoiceNumber}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{contract}{period ? ` · ${period}` : ''}</Text>
          </div>
        );
      },
    },
    { title: 'Сумма', dataIndex: 'totalAmount', key: 'amount', render: (v: number) => <Text strong>{formatMoney(v)}</Text>, width: 140 },
    { title: 'Срок', dataIndex: 'dueDate', key: 'due', render: (d: string) => formatDate(d), width: 100 },
    {
      title: 'Статус', key: 'status', width: 150,
      render: (_: unknown, r: Invoice) => {
        const m = INVOICE_STATUS_MAP[r.status];
        const tag = <Tag color={m?.color || 'default'}>{m?.label || r.status}</Tag>;
        if (r.status === 'overdue') {
          const days = Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000);
          return <>{tag} <Tag color={days > 30 ? 'red' : 'orange'}>{days}д</Tag></>;
        }
        if (r.status === 'paid' && r.paidAt) {
          return <>{tag} <Text type="secondary" style={{ fontSize: 11 }}>{formatDate(r.paidAt)}</Text></>;
        }
        return tag;
      },
    },
    {
      title: '', key: 'actions', width: 180,
      render: (_: unknown, r: Invoice) => (
        <span>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} style={{ marginRight: 4 }}>Детали</Button>
          {(r.status === 'pending' || r.status === 'overdue') && (
            <Button type="primary" size="small" onClick={() => payMutation.mutate(r.id)} loading={payMutation.isPending}>
              Оплатить
            </Button>
          )}
        </span>
      ),
    },
  ];

  const invoices = data || [];
  const pendingSum = invoices.filter((i) => i.status === 'pending').reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const overdueSum = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + Number(i.totalAmount || 0), 0);

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  // Получение данных тенанта из детализации счёта для реквизитов
  const tenant = invoiceDetail?.contract?.unit?.property?.tenant || invoiceDetail?.tenant || null;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Мои счета</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}><Card size="small"><Statistic title="Всего счетов" value={invoices.length} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="К оплате" value={formatMoney(pendingSum)} valueStyle={{ color: pendingSum > 0 ? '#faad14' : undefined }} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Просрочено" value={formatMoney(overdueSum)} valueStyle={{ color: overdueSum > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data || []}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => openDetail(r), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="У вас пока нет счетов." /> }}
      />

      <Drawer
        title={selected ? `Счёт ${selected.invoiceNumber}` : 'Детали счёта'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelected(null); setInvoiceDetail(null); }}
        width={window.innerWidth < 540 ? '100%' : 520}
      >
        {selected && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Номер счёта">{selected.invoiceNumber}</Descriptions.Item>
              <Descriptions.Item label="Договор">{(selected as any).contract?.contractNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Период">
                {selected.periodStart ? new Date(selected.periodStart).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Сумма"><Text strong>{formatMoney(selected.totalAmount)}</Text></Descriptions.Item>
              {selected.vatAmount && Number(selected.vatAmount) > 0 && (
                <Descriptions.Item label="В т.ч. НДС">{formatMoney(Number(selected.vatAmount))}</Descriptions.Item>
              )}
              <Descriptions.Item label="Срок оплаты">{formatDate(selected.dueDate)}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                {(() => {
                  const m = INVOICE_STATUS_MAP[selected.status];
                  return <Tag color={m?.color || 'default'}>{m?.label || selected.status}</Tag>;
                })()}
              </Descriptions.Item>
              {selected.status === 'overdue' && (
                <Descriptions.Item label="Просрочка">
                  <Tag color="red">{Math.floor((Date.now() - new Date(selected.dueDate).getTime()) / 86400000)} дней</Tag>
                </Descriptions.Item>
              )}
              {selected.paidAt && (
                <Descriptions.Item label="Оплачен">{formatDate(selected.paidAt)}</Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left">Реквизиты для оплаты</Divider>
            {tenant ? (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Получатель">{tenant.name}</Descriptions.Item>
                {tenant.inn && <Descriptions.Item label="ИНН">{tenant.inn}</Descriptions.Item>}
                {tenant.kpp && <Descriptions.Item label="КПП">{tenant.kpp}</Descriptions.Item>}
                {tenant.bankAccount && <Descriptions.Item label="Расчётный счёт">{tenant.bankAccount}</Descriptions.Item>}
                {tenant.bankName && <Descriptions.Item label="Банк">{tenant.bankName}</Descriptions.Item>}
                {tenant.bik && <Descriptions.Item label="БИК">{tenant.bik}</Descriptions.Item>}
                {tenant.corrAccount && <Descriptions.Item label="Корр. счёт">{tenant.corrAccount}</Descriptions.Item>}
              </Descriptions>
            ) : (
              <Text type="secondary">Реквизиты доступны в PDF-версии счёта</Text>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <Button icon={<FilePdfOutlined />} onClick={() => handleDownloadPdf(selected.id, selected.invoiceNumber)}>
                Скачать счёт PDF
              </Button>
              {(selected.status === 'pending' || selected.status === 'overdue') && (
                <Button type="primary" onClick={() => payMutation.mutate(selected.id)} loading={payMutation.isPending}>
                  Оплатить онлайн
                </Button>
              )}
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default TenantInvoices;
