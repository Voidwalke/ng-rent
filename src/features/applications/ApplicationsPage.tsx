import React, { useState } from 'react';
import { Typography, Table, Button, Select, Tag, Modal, Form, Input, DatePicker, Space, Empty, message, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { applicationsApi, clientsApi, unitsApi } from '../../api/endpoints';
import { formatDate } from '../../lib/format';
import { APPLICATION_STATUS_MAP } from '../../lib/constants';
import type { Application, ApplicationStatus, Client, Unit } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateApplicationDto } from '../../types/dto';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const statusOptions = Object.entries(APPLICATION_STATUS_MAP).map(([k, v]) => ({ value: k, label: (v as { label: string }).label }));

const ApplicationsPage: React.FC = () => {
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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery<PaginatedResponse<Application>>({
    queryKey: ['applications', page, statusFilter],
    queryFn: () => applicationsApi.list({ page, limit: 20, status: statusFilter }),
  });

  const filteredData = React.useMemo(() => {
    let items = data?.data || [];
    if (statusFilter) {
      items = items.filter((a) => a.status === statusFilter);
    }
    return items;
  }, [data, statusFilter]);

  const { data: clients } = useQuery<PaginatedResponse<Client>>({
    queryKey: ['clients-select'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  const { data: units } = useQuery<PaginatedResponse<Unit>>({
    queryKey: ['units-select-available'],
    queryFn: () => unitsApi.list({ limit: 200, status: 'available' }),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateApplicationDto) => applicationsApi.create(values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['applications'] }); setModalOpen(false); form.resetFields(); message.success('Заявка создана'); },
    onError: () => message.error('Ошибка создания заявки'),
  });

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const [start, end] = values.dateRange;
      const dto: CreateApplicationDto = {
        clientId: values.clientId,
        unitId: values.unitId,
        desiredStart: start.format('YYYY-MM-DD'),
        desiredEnd: end.format('YYYY-MM-DD'),
        comment: values.comment,
      };
      createMutation.mutate(dto);
    });
  };

  const handleBulkApprove = async () => {
    const eligible = filteredData.filter((app) => selectedIds.includes(app.id) && (app.status === 'submitted' || app.status === 'under_review'));
    if (eligible.length === 0) { message.warning('Нет подходящих заявок для одобрения'); return; }
    const results = await Promise.allSettled(eligible.map((app) => applicationsApi.approve(app.id)));
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    queryClient.invalidateQueries({ queryKey: ['applications'] });
    setSelectedIds([]);
    message.success(`Одобрено заявок: ${succeeded} из ${eligible.length}`);
  };

  const handleBulkReject = async () => {
    const eligible = filteredData.filter((app) => selectedIds.includes(app.id) && (app.status === 'submitted' || app.status === 'under_review'));
    if (eligible.length === 0) { message.warning('Нет подходящих заявок для отклонения'); return; }
    const results = await Promise.allSettled(eligible.map((app) => applicationsApi.reject(app.id, 'Массовое отклонение')));
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    queryClient.invalidateQueries({ queryKey: ['applications'] });
    setSelectedIds([]);
    message.success(`Отклонено заявок: ${succeeded} из ${eligible.length}`);
  };

  const columns = [
    { title: '№', dataIndex: 'id', key: 'id', render: (id: number) => <Link to={`/applications/${id}`}>#{id}</Link> },
    { title: 'Клиент', dataIndex: ['client', 'companyName'], key: 'client' },
    { title: 'Помещение', key: 'unit', render: (_: unknown, r: Application) => r.unit ? `${r.unit.property?.name || ''} — ${r.unit.unitNumber || r.unit.id}` : '—' },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ApplicationStatus) => { const m = APPLICATION_STATUS_MAP[s] || { label: s, color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
    {
      title: 'Ожидание', key: 'pending_days',
      render: (_: unknown, r: Application) => {
        const finalStatuses: ApplicationStatus[] = ['approved', 'rejected', 'contract_sent', 'signed', 'active', 'terminated'];
        if (finalStatuses.includes(r.status)) return '—';
        const days = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86400000);
        const color = days > 5 ? 'red' : days > 3 ? 'orange' : 'green';
        return <Tag color={color}>{days} дн.</Tag>;
      },
    },
    { title: 'Дата начала', dataIndex: 'desiredStart', key: 'start', render: (d: string) => formatDate(d) },
    { title: 'Дата окончания', dataIndex: 'desiredEnd', key: 'end', render: (d: string) => formatDate(d) },
    { title: 'Создана', dataIndex: 'createdAt', key: 'created', render: (d: string) => formatDate(d) },
    {
      title: '', key: 'actions',
      render: (_: unknown, r: Application) => <Link to={`/applications/${r.id}`}><Button icon={<EyeOutlined />} size="small" /></Link>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Заявки</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Новая заявка</Button>
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Всего" value={data?.total ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="На рассмотрении" value={(data?.data || []).filter((a) => a.status === 'submitted' || a.status === 'under_review').length} valueStyle={{ color: '#fa8c16' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Одобрено" value={(data?.data || []).filter((a) => a.status === 'approved').length} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Отклонено" value={(data?.data || []).filter((a) => a.status === 'rejected').length} /></Card>
        </Col>
      </Row>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Статус" allowClear options={statusOptions} value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 200 }} />
      </Space>
      {selectedIds.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 16px', background: '#e6f4ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text>Выбрано: {selectedIds.length}</Text>
          <Button size="small" type="primary" onClick={handleBulkApprove}>Одобрить выбранные</Button>
          <Button size="small" danger onClick={handleBulkReject}>Отклонить выбранные</Button>
          <Button size="small" type="link" onClick={() => setSelectedIds([])}>Сбросить</Button>
        </div>
      )}
      <Table columns={columns} dataSource={filteredData} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Заявок пока нет. Клиенты могут подать заявку через каталог" /> }} />

      <Modal title="Новая заявка" open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} confirmLoading={createMutation.isPending} okText="Создать" cancelText="Отмена">
        <Form form={form} layout="vertical">
          <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
            <Select showSearch optionFilterProp="label" options={(clients?.data || []).map((c: Client) => ({ value: c.id, label: c.companyName }))} />
          </Form.Item>
          <Form.Item name="unitId" label="Помещение" rules={[{ required: true, message: 'Выберите помещение' }]}>
            <Select showSearch optionFilterProp="label" options={(units?.data || []).map((u: Unit) => ({ value: u.id, label: `${u.property?.name || ''} — ${u.unitNumber || u.id} (${u.areaSqm} м²)` }))} />
          </Form.Item>
          <Form.Item name="dateRange" label="Период аренды" rules={[{ required: true, message: 'Выберите период' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="comment" label="Комментарий">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApplicationsPage;
