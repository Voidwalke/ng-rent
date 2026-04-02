import React, { useState } from 'react';
import { Typography, Table, Button, Input, Tag, Space, Card, Row, Col, Statistic, Modal, Form, InputNumber, Select, DatePicker, Popconfirm, Empty, message, theme } from 'antd';
import { PlusOutlined, DollarOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined, RollbackOutlined, FileTextOutlined, ExportOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { invoicesApi, contractsApi, paymentsApi, authApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatDate, formatMoney } from '../../lib/format';
import { INVOICE_STATUS_MAP } from '../../lib/constants';
import type { Invoice, InvoiceStatus, Contract } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateInvoiceDto, PayInvoiceDto, CreditNoteDto } from '../../types/dto';
import { exportTableToCsv } from '../../lib/export';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const InvoicesPage: React.FC = () => {
  usePageTitle('Счета');
  const { token } = theme.useToken();
  const { hasRole } = useAuthStore();
  const canManage = hasRole('admin', 'manager');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || undefined;
  const page = Number(searchParams.get('page')) || 1;
  const setStatusFilter = (v: string | undefined) => {
    const p = new URLSearchParams(searchParams);
    if (v) p.set('status', v); else p.delete('status');
    p.set('page', '1');
    setSearchParams(p);
  };
  const setPage = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(p));
    setSearchParams(params);
  };
  const [createModal, setCreateModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [creditNoteModal, setCreditNoteModal] = useState(false);
  const [refundInvoice, setRefundInvoice] = useState<Invoice | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [form] = Form.useForm();
  const [payForm] = Form.useForm();
  const [creditForm] = Form.useForm();

  const { data, isLoading } = useQuery<PaginatedResponse<Invoice>>({
    queryKey: ['invoices', page, statusFilter],
    queryFn: () => invoicesApi.list({ page, limit: 20, status: statusFilter }),
  });

  const { data: contracts } = useQuery<PaginatedResponse<Contract>>({
    queryKey: ['contracts-select'],
    queryFn: () => contractsApi.list({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateInvoiceDto) => invoicesApi.create(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); setCreateModal(false); form.resetFields(); message.success('Счёт создан'); },
    onError: () => message.error('Ошибка создания'),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: PayInvoiceDto }) => invoicesApi.pay(id, dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); setPayModal(false); message.success('Оплата зарегистрирована'); },
    onError: () => message.error('Ошибка оплаты'),
  });

  const onlinePayMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await paymentsApi.createOnline(invoiceId);
      // Если confirmationUrl — фейковый мок, имитация вебхука
      if (res.confirmationUrl?.includes('/mock/')) {
        const externalId = res.confirmationUrl.split('/mock/')[1];
        if (externalId) await paymentsApi.simulateWebhook(externalId);
        return { ...res, confirmationUrl: null };
      }
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (res.confirmationUrl) {
        message.loading('Переход к оплате...');
        window.open(res.confirmationUrl, '_blank');
        message.info('После оплаты статус обновится автоматически');
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['invoices-summary'] });
        }, 5000);
        setTimeout(() => clearInterval(pollInterval), 120000);
      } else {
        message.success('Платёж проведён');
      }
    },
    onError: () => message.error('Ошибка создания платежа'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => invoicesApi.cancel(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); message.success('Счёт отменён'); },
    onError: () => message.error('Ошибка'),
  });

  const creditNoteMutation = useMutation({
    mutationFn: (dto: CreditNoteDto) => invoicesApi.creditNote(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); setCreditNoteModal(false); creditForm.resetFields(); message.success('Кредит-нота создана'); },
    onError: () => message.error('Ошибка создания кредит-ноты'),
  });

  const refundMutation = useMutation({
    mutationFn: ({ invoiceId, amount }: { invoiceId: number; amount?: number }) => paymentsApi.refund(invoiceId, amount),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); message.success('Возврат оформлен'); },
    onError: () => message.error('Ошибка возврата'),
  });

  const handleDownloadSchetFaktura = async (invoiceId: number, invoiceNumber: string) => {
    try {
      const blob = await invoicesApi.downloadSchetFaktura(invoiceId);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `schet_faktura_${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Ошибка скачивания счёта-фактуры');
    }
  };

  const { data: profileData } = useQuery({ queryKey: ['my-requisites'], queryFn: () => authApi.me() });
  const myTenant = (profileData as any)?.tenant;

  const { data: summary } = useQuery<{ totalPending: number; pendingCount: number; totalOverdue: number; overdueCount: number; paidThisMonth: number; paidThisMonthCount: number }>({
    queryKey: ['invoices-summary'],
    queryFn: () => invoicesApi.summary(),
  });

  const invoiceStats = React.useMemo(() => {
    const all = data?.data || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      total: data?.total ?? 0,
      pendingSum: all.filter((inv: any) => inv.status === 'pending').reduce((s: number, inv: any) => s + Number(inv.totalAmount || 0), 0),
      overdueSum: all.filter((inv: any) => inv.status === 'overdue').reduce((s: number, inv: any) => s + Number(inv.totalAmount || 0), 0),
      paidThisMonth: all.filter((inv: any) => inv.status === 'paid' && inv.paidAt && new Date(inv.paidAt) >= monthStart).reduce((s: number, inv: any) => s + Number(inv.totalAmount || 0), 0),
    };
  }, [data]);

  const handleBulkCancel = async () => {
    const cancellable = (data?.data || []).filter((inv) => selectedIds.includes(inv.id) && (inv.status === 'pending' || inv.status === 'overdue'));
    if (cancellable.length === 0) { message.warning('Нет подходящих счетов для отмены'); return; }
    const results = await Promise.allSettled(cancellable.map((inv) => invoicesApi.cancel(inv.id)));
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoices-summary'] });
    setSelectedIds([]);
    message.success(`Отменено счетов: ${succeeded} из ${cancellable.length}`);
  };

  const statusOptions = Object.entries(INVOICE_STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }));

  const columns = [
    {
      title: '№ счёта', key: 'num', width: 200,
      render: (_: unknown, r: Invoice) => {
        const n = r.invoiceNumber;
        let typeTag = null;
        if (n.startsWith('PEN-')) typeTag = <Tag color="orange" style={{ fontSize: 10 }}>Пени</Tag>;
        else if (n.startsWith('CN-')) typeTag = <Tag color="purple" style={{ fontSize: 10 }}>КН</Tag>;
        else if (n.startsWith('DEP-')) typeTag = <Tag color="blue" style={{ fontSize: 10 }}>Депозит</Tag>;
        const period = r.periodStart ? new Date(r.periodStart).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) : '';
        return <div>{typeTag}{n}<br/><span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>{(r as any).contract?.contractNumber}{period ? ` · ${period}` : ''}</span></div>;
      },
    },
    {
      title: 'Клиент', key: 'client', ellipsis: true,
      render: (_: unknown, r: Invoice) => (r as any).contract?.client?.companyName || '—',
    },
    { title: 'Сумма', dataIndex: 'totalAmount', key: 'amount', render: (v: number) => formatMoney(v), width: 130 },
    { title: 'Срок', dataIndex: 'dueDate', key: 'due', render: (d: string) => formatDate(d), width: 100 },
    {
      title: 'Статус', key: 'status', width: 140,
      render: (_: unknown, r: Invoice) => {
        const m = INVOICE_STATUS_MAP[r.status];
        const tag = <Tag color={m?.color || 'default'}>{m?.label || r.status}</Tag>;
        if (r.status === 'overdue') {
          const days = Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000);
          return <>{tag} <Tag color={days > 30 ? 'red' : 'orange'}>{days}д</Tag></>;
        }
        if (r.status === 'paid' && r.paidAt) {
          return <>{tag} <span style={{ color: token.colorTextQuaternary, fontSize: 11 }}>{formatDate(r.paidAt)}</span></>;
        }
        return tag;
      },
    },
    {
      title: 'Документы', key: 'docs',
      render: (_: unknown, r: Invoice) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => invoicesApi.downloadDocument(r.id).then((blob: any) => {
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const a = document.createElement('a'); a.href = url; a.download = `invoice-${r.invoiceNumber}.pdf`;
            document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
          }).catch(() => message.error('Ошибка'))}>Счёт</Button>
          {r.status === 'paid' && Number(r.vatAmount || 0) > 0 && (
            <Button size="small" onClick={() => handleDownloadSchetFaktura(r.id, r.invoiceNumber)}>СФ</Button>
          )}
        </Space>
      ),
    },
    ...(canManage ? [{
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: Invoice) => (
        <Space>
          {(r.status === 'pending' || r.status === 'overdue') && (
            <>
              <Button size="small" type="primary" onClick={() => onlinePayMutation.mutate(r.id)} loading={onlinePayMutation.isPending}>
                Оплатить
              </Button>
              <Button size="small" onClick={() => { setSelectedInvoice(r); payForm.setFieldsValue({ paidAmount: r.totalAmount }); setPayModal(true); }}>
                Зарег. оплату
              </Button>
            </>
          )}
          {r.status === 'paid' && (
            <>
              <Popconfirm title="Вы уверены? Это действие нельзя отменить." onConfirm={() => refundMutation.mutate({ invoiceId: r.id })} okText="Да, вернуть" cancelText="Отмена">
                <Button size="small" icon={<RollbackOutlined />}>Возврат</Button>
              </Popconfirm>
              <Button size="small" onClick={() => { setRefundInvoice(r); creditForm.setFieldsValue({ invoiceId: r.id, amount: r.totalAmount }); setCreditNoteModal(true); }}>Кредит-нота</Button>
            </>
          )}
          {r.status === 'pending' && (
            <Popconfirm title="Отменить счёт?" onConfirm={() => cancelMutation.mutate(r.id)}>
              <Button size="small" danger>Отменить</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Счета</Title>
        <Space>
          <Button icon={<ExportOutlined />} onClick={() => exportTableToCsv(
            [
              { title: '№', dataIndex: 'invoiceNumber' },
              { title: 'Договор', dataIndex: ['contract', 'contractNumber'] },
              { title: 'Сумма', dataIndex: 'totalAmount' },
              { title: 'Срок оплаты', dataIndex: 'dueDate' },
              { title: 'Статус', dataIndex: 'status' },
              { title: 'Оплачен', dataIndex: 'paidAt' },
            ],
            (data?.data || []) as Record<string, unknown>[],
            'invoices',
          )}>Экспорт</Button>
          {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModal(true); }}>Создать счёт</Button>}
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Всего" value={invoiceStats.total} prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="К оплате" value={formatMoney(invoiceStats.pendingSum)} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Просрочено" value={formatMoney(invoiceStats.overdueSum)} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Оплачено за месяц" value={formatMoney(invoiceStats.paidThisMonth)} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      {myTenant && (myTenant.bankAccount || myTenant.inn) && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Ваши реквизиты (указываются в счетах):</Text>
          <Text type="secondary">
            {myTenant.name}{myTenant.inn ? ` · ИНН ${myTenant.inn}` : ''}{myTenant.bankAccount ? ` · р/с ${myTenant.bankAccount}` : ''}{myTenant.bankName ? ` · ${myTenant.bankName}` : ''}{myTenant.bik ? ` · БИК ${myTenant.bik}` : ''}
          </Text>
        </Card>
      )}

      <Select placeholder="Статус" allowClear options={statusOptions} value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 200, marginBottom: 16 }} />

      {selectedIds.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 16px', background: '#e6f4ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text>Выбрано: {selectedIds.length}</Text>
          <Button size="small" danger onClick={handleBulkCancel}>Отменить выбранные</Button>
          <Button size="small" type="link" onClick={() => setSelectedIds([])}>Сбросить</Button>
        </div>
      )}

      <Table columns={columns} dataSource={data?.data || []} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Счета формируются автоматически по активным договорам" /> }} />

      <Modal
        title="Создать счёт"
        open={createModal}
        onOk={() => form.validateFields().then((v) => {
          const dto: CreateInvoiceDto = { contractId: v.contractId, amount: v.amount, dueDate: v.dueDate.format('YYYY-MM-DD') };
          createMutation.mutate(dto);
        })}
        onCancel={() => setCreateModal(false)}
        confirmLoading={createMutation.isPending}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="contractId" label="Договор" rules={[{ required: true, message: 'Выберите договор' }]}>
            <Select options={(contracts?.data || []).map((c: Contract) => ({ value: c.id, label: c.contractNumber }))} />
          </Form.Item>
          <Form.Item name="amount" label="Сумма" rules={[{ required: true, message: 'Укажите сумму' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="dueDate" label="Срок оплаты" rules={[{ required: true, message: 'Выберите дату' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Оплата счёта ${selectedInvoice?.invoiceNumber || ''}`}
        open={payModal}
        onOk={() => payForm.validateFields().then((v) => {
          const dto: PayInvoiceDto = { paidAmount: v.paidAmount, paymentReference: v.paymentReference || '' };
          payMutation.mutate({ id: selectedInvoice!.id, dto });
        })}
        onCancel={() => setPayModal(false)}
        confirmLoading={payMutation.isPending}
        okText="Подтвердить оплату"
        cancelText="Отмена"
      >
        <Form form={payForm} layout="vertical">
          <Form.Item name="paidAmount" label={`Сумма оплаты (макс. ${selectedInvoice ? formatMoney(Number(selectedInvoice.totalAmount) - Number(selectedInvoice.paidAmount || 0)) : '—'})`} rules={[{ required: true, message: 'Укажите сумму' }, { type: 'number', max: selectedInvoice ? Number(selectedInvoice.totalAmount) - Number(selectedInvoice.paidAmount || 0) : undefined, message: 'Сумма превышает остаток по счёту' }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paymentReference" label="Номер платёжного поручения" rules={[{ required: true, message: 'Укажите номер' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Кредит-нота к счёту ${refundInvoice?.invoiceNumber || ''}`}
        open={creditNoteModal}
        onOk={() => creditForm.validateFields().then((v) => creditNoteMutation.mutate({ invoiceId: v.invoiceId, amount: v.amount, reason: v.reason }))}
        onCancel={() => { setCreditNoteModal(false); setRefundInvoice(null); }}
        confirmLoading={creditNoteMutation.isPending}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={creditForm} layout="vertical">
          <Form.Item name="invoiceId" hidden><Input /></Form.Item>
          <Form.Item name="amount" label="Сумма возврата" rules={[{ required: true, message: 'Укажите сумму' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Причина" rules={[{ required: true, message: 'Укажите причину' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InvoicesPage;
