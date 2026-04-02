import React, { useState, useMemo } from 'react';
import { Typography, Table, Button, Input, Space, Drawer, Descriptions, Tabs, Popconfirm, Modal, Form, Tag, Tooltip, Statistic, Empty, message, Row, Col, Card } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, WarningOutlined, ExportOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { clientsApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatDate, formatMoney } from '../../lib/format';
import type { Client } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateClientDto, UpdateClientDto } from '../../types/dto';
import { exportTableToCsv } from '../../lib/export';

const { Title } = Typography;

interface ClientHistoryData {
  applications?: { id: number; status: string; createdAt: string }[];
  contracts?: { id: number; contractNumber: string; status: string; monthlyRent: number }[];
  invoices?: { id: number; invoiceNumber: string; status: string; totalAmount: number; dueDate?: string }[];
  payments?: unknown[];
}

const ClientsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const canManage = hasRole("admin", "manager");
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = Number(searchParams.get('page')) || 1;
  const setSearch = (v: string) => {
    const p = new URLSearchParams(searchParams);
    if (v) p.set('search', v); else p.delete('search');
    p.set('page', '1');
    setSearchParams(p);
  };
  const setPage = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(p));
    setSearchParams(params);
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery<PaginatedResponse<Client>>({
    queryKey: ['clients', page, search],
    queryFn: () => clientsApi.list({ page, limit: 20, search: search || undefined }),
  });

  const filteredData = useMemo(() => {
    let items = data?.data || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((c) =>
        c.companyName.toLowerCase().includes(s) ||
        (c.inn || '').includes(s) ||
        c.contactEmail.toLowerCase().includes(s)
      );
    }
    return items;
  }, [data, search]);

  const createMutation = useMutation({
    mutationFn: (values: CreateClientDto) => clientsApi.create(values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); setModalOpen(false); form.resetFields(); message.success('Клиент создан'); },
    onError: () => message.error('Ошибка создания'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...values }: UpdateClientDto & { id: number }) => clientsApi.update(id, values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); setModalOpen(false); setEditing(null); form.resetFields(); message.success('Клиент обновлён'); },
    onError: () => message.error('Ошибка обновления'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); message.success('Клиент удалён'); },
    onError: () => message.error('Ошибка удаления'),
  });

  const { data: clientHistory } = useQuery<ClientHistoryData>({
    queryKey: ['client-history', selected?.id],
    queryFn: () => clientsApi.history(selected!.id) as Promise<ClientHistoryData>,
    enabled: !!selected && drawerOpen,
  });

  /** Calculate total overdue amount from client history invoices */
  const overdueTotal = useMemo(() => {
    if (!clientHistory?.invoices) return 0;
    return clientHistory.invoices
      .filter((inv) => inv.status === 'overdue')
      .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  }, [clientHistory]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: Client) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const openDrawer = (r: Client) => { setSelected(r); setDrawerOpen(true); };
  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editing) updateMutation.mutate({ id: editing.id, ...values });
      else createMutation.mutate(values);
    });
  };

  const columns = [
    { title: 'Компания', dataIndex: 'companyName', key: 'name' },
    { title: 'ИНН', dataIndex: 'inn', key: 'inn', render: (v: string) => v || '—' },
    { title: 'Контакт', dataIndex: 'contactName', key: 'contact' },
    { title: 'Email', dataIndex: 'contactEmail', key: 'email' },
    { title: 'Телефон', dataIndex: 'contactPhone', key: 'phone', render: (v: string) => v || '—' },
    {
      title: 'Задолженность', dataIndex: 'overdueAmount', key: 'debt',
      sorter: (a: Client, b: Client) => (a.overdueAmount || 0) - (b.overdueAmount || 0),
      render: (v: number | undefined) =>
        v && v > 0
          ? <span style={{ color: '#ff4d4f', fontWeight: 500 }}>{formatMoney(v)}</span>
          : '—',
    },
    { title: 'Создан', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    {
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: Client) => (
        <Space>
          {canManage && <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />}
          {canManage && (
            <Popconfirm title="Удалить клиента?" onConfirm={() => deleteMutation.mutate(r.id)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Клиенты</Title>
        <Space>
          <Button icon={<ExportOutlined />} onClick={() => exportTableToCsv(
            [
              { title: 'Компания', dataIndex: 'companyName' },
              { title: 'ИНН', dataIndex: 'inn' },
              { title: 'Контакт', dataIndex: 'contactName' },
              { title: 'Email', dataIndex: 'contactEmail' },
              { title: 'Телефон', dataIndex: 'contactPhone' },
              { title: 'Задолженность', dataIndex: 'overdueAmount' },
              { title: 'Создан', dataIndex: 'createdAt' },
            ],
            filteredData as Record<string, unknown>[],
            'clients',
          )}>Экспорт</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button>
        </Space>
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small"><Statistic title="Всего контрагентов" value={data?.total ?? 0} /></Card>
        </Col>
        <Col xs={8}>
          <Card size="small"><Statistic title="С задолженностью" value={(data?.data || []).filter((c) => (c.overdueAmount || 0) > 0).length} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={8}>
          <Card size="small"><Statistic title="Добавлено за месяц" value={(data?.data || []).filter((c) => { const d = new Date(c.createdAt); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length} /></Card>
        </Col>
      </Row>
      <Input prefix={<SearchOutlined />} placeholder="Поиск по имени, ИНН, email..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 360, marginBottom: 16 }} />
      <Table columns={columns} dataSource={filteredData} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Добавьте первого контрагента"><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button></Empty> }} />

      <Drawer title={selected?.companyName} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={window.innerWidth < 500 ? '100%' : 480}>
        {selected && (
          <Tabs items={[
            {
              key: 'info', label: 'Информация',
              children: (
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="Компания">{selected.companyName}</Descriptions.Item>
                  <Descriptions.Item label="ИНН">{selected.inn || '—'}</Descriptions.Item>
                  <Descriptions.Item label="КПП">{selected.kpp || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Юр. адрес">{selected.legalAddress || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Контактное лицо">{selected.contactName}</Descriptions.Item>
                  <Descriptions.Item label="Email">{selected.contactEmail}</Descriptions.Item>
                  <Descriptions.Item label="Телефон">{selected.contactPhone || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Р/с">{selected.bankAccount || '—'}</Descriptions.Item>
                  <Descriptions.Item label="БИК">{selected.bik || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Создан">{formatDate(selected.createdAt)}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'history', label: 'История',
              children: clientHistory ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  {overdueTotal > 0 && (
                    <Statistic
                      title="Просроченная задолженность"
                      value={formatMoney(overdueTotal)}
                      valueStyle={{ color: '#ff4d4f' }}
                      prefix={<WarningOutlined />}
                    />
                  )}
                  {clientHistory.applications?.length ? (
                    <div>
                      <Typography.Text strong>Заявки</Typography.Text>
                      <Table size="small" pagination={false} rowKey="id" dataSource={clientHistory.applications} columns={[
                        { title: 'ID', dataIndex: 'id', width: 60 },
                        { title: 'Статус', dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
                        { title: 'Дата', dataIndex: 'createdAt', render: (d: string) => formatDate(d) },
                      ]} />
                    </div>
                  ) : null}
                  {clientHistory.contracts?.length ? (
                    <div>
                      <Typography.Text strong>Договоры</Typography.Text>
                      <Table size="small" pagination={false} rowKey="id" dataSource={clientHistory.contracts} columns={[
                        { title: '№', dataIndex: 'contractNumber' },
                        { title: 'Статус', dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
                        { title: 'Аренда/мес', dataIndex: 'monthlyRent', render: (v: number) => formatMoney(v) },
                      ]} />
                    </div>
                  ) : null}
                  {clientHistory.invoices?.length ? (
                    <div>
                      <Typography.Text strong>Счета</Typography.Text>
                      <Table size="small" pagination={false} rowKey="id" dataSource={clientHistory.invoices} columns={[
                        { title: '№', dataIndex: 'invoiceNumber' },
                        { title: 'Статус', dataIndex: 'status', render: (s: string) => <Tag color={s === 'overdue' ? 'red' : undefined}>{s}</Tag> },
                        { title: 'Сумма', dataIndex: 'totalAmount', render: (v: number) => formatMoney(v) },
                      ]} />
                    </div>
                  ) : null}
                </Space>
              ) : <Typography.Text type="secondary">Загрузка...</Typography.Text>,
            },
          ]} />
        )}
      </Drawer>

      <Modal title={editing ? 'Редактировать клиента' : 'Новый клиент'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditing(null); }} confirmLoading={createMutation.isPending || updateMutation.isPending} okText="Сохранить" cancelText="Отмена" width={window.innerWidth < 768 ? '95%' : 560}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyName" label="Название компании" rules={[{ required: true, message: 'Обязательное поле' }]}><Input /></Form.Item>
          <Form.Item name="inn" label="ИНН"><Input /></Form.Item>
          <Form.Item name="contactName" label="Контактное лицо" rules={[{ required: true, message: 'Обязательное поле' }]}><Input /></Form.Item>
          <Form.Item name="contactEmail" label="Email" rules={[{ required: true, message: 'Обязательное поле' }, { type: 'email', message: 'Некорректный email' }]}><Input /></Form.Item>
          <Form.Item name="contactPhone" label="Телефон"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ClientsPage;
