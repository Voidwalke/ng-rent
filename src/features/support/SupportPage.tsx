import React, { useState } from 'react';
import { Typography, Table, Button, Select, Tag, Modal, Form, Input, Empty, message } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { ticketsApi } from '../../api/endpoints';
import { formatDate } from '../../lib/format';
import { TICKET_STATUS_MAP, TICKET_PRIORITY_MAP } from '../../lib/constants';
import type { SupportTicket, TicketStatus, TicketPriority } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateTicketDto } from '../../types/dto';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title } = Typography;

const statusOptions = Object.entries(TICKET_STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }));
const PRIORITY_SLA: Record<string, string> = { low: 'до 3 рабочих дней', medium: 'до 24 часов', high: 'до 4 часов', critical: 'до 1 часа' };
const priorityOptions = Object.entries(TICKET_PRIORITY_MAP).map(([k, v]) => ({ value: k, label: `${v.label} (${PRIORITY_SLA[k] || ''})` }));

const SupportPage: React.FC = () => {
  usePageTitle('Поддержка');
  const location = useLocation();
  const basePath = location.pathname.startsWith('/my') ? '/my/tickets' : '/support';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery<PaginatedResponse<SupportTicket>>({
    queryKey: ['tickets', page, statusFilter],
    queryFn: () => ticketsApi.list({ page, limit: 20, status: statusFilter }),
  });

  const filteredData = React.useMemo(() => {
    let items = data?.data || [];
    if (statusFilter) items = items.filter((t) => t.status === statusFilter);
    return items;
  }, [data, statusFilter]);

  const createMutation = useMutation({
    mutationFn: (dto: CreateTicketDto) => ticketsApi.create(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tickets'] }); setModalOpen(false); form.resetFields(); message.success('Обращение создано'); },
    onError: () => message.error('Ошибка'),
  });

  const columns = [
    { title: '№', dataIndex: 'id', key: 'id', render: (id: number) => <Link to={`${basePath}/${id}`}>#{id}</Link> },
    { title: 'Тема', dataIndex: 'subject', key: 'subject' },
    { title: 'Категория', dataIndex: 'category', key: 'cat', render: (v: string) => v || '—' },
    {
      title: 'Приоритет', dataIndex: 'priority', key: 'priority',
      render: (p: TicketPriority) => {
        const m = TICKET_PRIORITY_MAP[p];
        return <Tag color={m?.color || 'default'}>{m?.label || p}</Tag>;
      },
    },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: TicketStatus) => {
        const m = TICKET_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    { title: 'Создано', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    {
      title: '', key: 'actions',
      render: (_: unknown, r: SupportTicket) => <Link to={`${basePath}/${r.id}`}><Button icon={<EyeOutlined />} size="small" /></Link>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Поддержка</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Новое обращение</Button>
      </div>
      <Select placeholder="Статус" allowClear options={statusOptions} value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 200, marginBottom: 16 }} />
      <Table columns={columns} dataSource={filteredData} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Обращений в поддержку нет" /> }} />

      <Modal title="Новое обращение" open={modalOpen} onOk={() => form.validateFields().then((v) => createMutation.mutate(v as CreateTicketDto))} onCancel={() => setModalOpen(false)} confirmLoading={createMutation.isPending} okText="Создать" cancelText="Отмена">
        <Form form={form} layout="vertical">
          <Form.Item name="subject" label="Тема" rules={[{ required: true, message: 'Введите тему' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="Категория">
            <Select options={[
              { value: 'billing', label: 'Оплата' },
              { value: 'technical', label: 'Техническая проблема' },
              { value: 'access', label: 'Доступ' },
              { value: 'other', label: 'Другое' },
            ]} />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет">
            <Select options={priorityOptions} />
          </Form.Item>
          <Form.Item name="message" label="Описание" rules={[{ required: true, message: 'Введите описание' }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SupportPage;
