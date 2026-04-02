import React, { useState } from 'react';
import { Typography, Table, Button, Input, Select, Space, Tag, Modal, Form, InputNumber, Popconfirm, Empty, message, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, ToolOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unitsApi, propertiesApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatArea, formatMoney } from '../../lib/format';
import { UNIT_STATUS_MAP } from '../../lib/constants';
import type { Unit, UnitStatus, Property } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateUnitDto, UpdateUnitDto, FilterUnitDto } from '../../types/dto';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title } = Typography;

const statusOptions = Object.entries(UNIT_STATUS_MAP).map(([k, v]) => ({ value: k, label: (v as { label: string }).label }));

const UnitsPage: React.FC = () => {
  usePageTitle('Помещения');
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const canManage = hasRole("admin", "manager");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<UnitStatus | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form] = Form.useForm();

  const params: FilterUnitDto = { page, limit: 20, propertyId: propertyFilter, status: statusFilter };

  const { data, isLoading } = useQuery<PaginatedResponse<Unit>>({
    queryKey: ['units', page, search, propertyFilter, statusFilter],
    queryFn: () => unitsApi.list(params),
  });

  const { data: properties } = useQuery<PaginatedResponse<Property>>({
    queryKey: ['properties-select'],
    queryFn: () => propertiesApi.list({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateUnitDto) => unitsApi.create(values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units'] }); setModalOpen(false); form.resetFields(); message.success('Помещение создано'); },
    onError: () => message.error('Ошибка создания'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...values }: UpdateUnitDto & { id: number }) => unitsApi.update(id, values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units'] }); setModalOpen(false); setEditing(null); form.resetFields(); message.success('Помещение обновлено'); },
    onError: () => message.error('Ошибка обновления'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => unitsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units'] }); message.success('Помещение удалено'); },
    onError: () => message.error('Ошибка удаления'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: (id: number) => unitsApi.setMaintenance(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units'] }); message.success('Переведено на обслуживание'); },
    onError: () => message.error('Ошибка'),
  });

  const availableMutation = useMutation({
    mutationFn: (id: number) => unitsApi.setAvailable(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units'] }); message.success('Помещение доступно'); },
    onError: () => message.error('Ошибка'),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: Unit) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editing) updateMutation.mutate({ id: editing.id, ...values });
      else createMutation.mutate(values);
    });
  };

  const propOptions = (properties?.data || []).map((p: Property) => ({ value: p.id, label: p.name }));

  const filteredData = React.useMemo(() => {
    let items = data?.data || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((u) => (u.unitNumber || '').toLowerCase().includes(s));
    }
    return items;
  }, [data, search]);

  const columns = [
    { title: '№', dataIndex: 'unitNumber', key: 'num', render: (v: string, r: Unit) => <Link to={`/units/${r.id}`}>{v || `#${r.id}`}</Link> },
    { title: 'Объект', dataIndex: ['property', 'name'], key: 'property' },
    { title: 'Этаж', dataIndex: 'floor', key: 'floor' },
    { title: 'Площадь', dataIndex: 'areaSqm', key: 'area', render: (v: number) => formatArea(v) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: UnitStatus) => { const m = UNIT_STATUS_MAP[s] || { label: s, color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; },
    },
    { title: 'Цена/мес', dataIndex: 'priceMonth', key: 'price', render: (v: number) => formatMoney(v) },
    {
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: Unit) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />
          {r.status === 'maintenance' ? (
            <Button icon={<CheckCircleOutlined />} size="small" title="Вернуть в доступные" onClick={() => availableMutation.mutate(r.id)}>Доступно</Button>
          ) : r.status === 'available' ? (
            <Button icon={<ToolOutlined />} size="small" title="На обслуживание" onClick={() => maintenanceMutation.mutate(r.id)}>Обслуж.</Button>
          ) : null}
          <Popconfirm title="Удалить?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Помещения</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Всего помещений" value={data?.total ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Доступно" value={data?.data?.filter((u: any) => u.status === 'available').length ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Арендовано" value={data?.data?.filter((u: any) => u.status === 'rented').length ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="На обслуживании" value={data?.data?.filter((u: any) => u.status === 'maintenance').length ?? 0} /></Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input prefix={<SearchOutlined />} placeholder="Поиск..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} allowClear style={{ width: 240 }} />
        <Select placeholder="Объект" allowClear options={propOptions} value={propertyFilter} onChange={(v) => { setPropertyFilter(v); setPage(1); }} style={{ width: 200 }} />
        <Select placeholder="Статус" allowClear options={statusOptions} value={statusFilter} onChange={(v) => { setStatusFilter(v as UnitStatus); setPage(1); }} style={{ width: 160 }} />
      </Space>
      <Table columns={columns} dataSource={filteredData} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>Нет помещений.<br/>Создайте помещения в разделе объектов.</span>}><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button></Empty> }} />

      <Modal title={editing ? 'Редактировать помещение' : 'Новое помещение'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditing(null); }} confirmLoading={createMutation.isPending || updateMutation.isPending} okText="Сохранить" cancelText="Отмена">
        <Form form={form} layout="vertical">
          <Form.Item name="propertyId" label="Объект" rules={[{ required: true, message: 'Выберите объект' }]}>
            <Select options={propOptions} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="floor" label="Этаж" rules={[{ required: true, message: 'Укажите этаж' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="areaSqm" label="Площадь (м²)" rules={[{ required: true, message: 'Укажите площадь' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="priceMonth" label="Цена/мес (руб)" rules={[{ required: true, message: 'Укажите цену' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Статус" rules={[{ required: true, message: 'Выберите статус' }]}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UnitsPage;
