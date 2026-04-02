import React, { useState } from 'react';
import { Typography, Table, Button, Input, Select, Space, Tag, Modal, Form, InputNumber, Popconfirm, Upload, Image, Tabs, Empty, message, Progress, Tooltip, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, EyeOutlined, UploadOutlined, LinkOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { propertiesApi, dashboardApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatArea } from '../../lib/format';
import { PROPERTY_TYPE_MAP } from '../../lib/constants';
import type { Property, PropertyType, OccupancyPoint } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreatePropertyDto } from '../../types/dto';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title } = Typography;
const { Dragger } = Upload;

const typeOptions = Object.entries(PROPERTY_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }));

const PropertiesPage: React.FC = () => {
  usePageTitle('Объекты');
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const canManage = hasRole("admin", "manager");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form] = Form.useForm();

  // Состояние загрузки изображений (только для режима редактирования)
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [imageTab, setImageTab] = useState<string>('upload');

  const { data, isLoading } = useQuery<PaginatedResponse<Property>>({
    queryKey: ['properties', page, search, typeFilter],
    queryFn: () => propertiesApi.list({ page, limit: 20, search: search || undefined, type: typeFilter }),
  });

  const { data: occupancyData } = useQuery<OccupancyPoint[]>({
    queryKey: ['occupancy'],
    queryFn: () => dashboardApi.occupancy(),
  });

  const occupancyMap = React.useMemo(() => {
    const map = new Map<number, OccupancyPoint>();
    if (occupancyData) {
      for (const item of occupancyData) {
        map.set(item.propertyId, item);
      }
    }
    return map;
  }, [occupancyData]);

  const filteredData = React.useMemo(() => {
    let items = data?.data || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(s) || p.address.toLowerCase().includes(s));
    }
    if (typeFilter) {
      items = items.filter((p) => p.type === typeFilter);
    }
    return items;
  }, [data, search, typeFilter]);

  const createMutation = useMutation({
    mutationFn: (values: CreatePropertyDto) => propertiesApi.create(values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['properties'] }); setModalOpen(false); form.resetFields(); setPreviewUrl(undefined); message.success('Объект создан'); },
    onError: () => message.error('Ошибка создания'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...values }: Partial<CreatePropertyDto> & { id: number }) => propertiesApi.update(id, values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['properties'] }); setModalOpen(false); setEditing(null); form.resetFields(); setPreviewUrl(undefined); message.success('Объект обновлён'); },
    onError: () => message.error('Ошибка обновления'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => propertiesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['properties'] }); message.success('Объект удалён'); },
    onError: () => message.error('Ошибка удаления'),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setPreviewUrl(undefined);
    setImageTab('link');
    setModalOpen(true);
  };

  const openEdit = (r: Property) => {
    setEditing(r);
    form.setFieldsValue(r);
    setPreviewUrl(r.imageUrl || undefined);
    setImageTab(r.imageUrl ? 'link' : 'upload');
    setModalOpen(true);
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editing) {
        updateMutation.mutate({ id: editing.id, ...values });
      } else {
        createMutation.mutate(values as CreatePropertyDto);
      }
    });
  };

  const handleImageUpload = async (file: RcFile) => {
    if (!editing) {
      message.warning('Сохраните объект перед загрузкой фото');
      return false;
    }
    setUploading(true);
    try {
      const updated = await propertiesApi.uploadImage(editing.id, file);
      setPreviewUrl(updated.imageUrl || undefined);
      form.setFieldValue('imageUrl', updated.imageUrl);
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['property', String(editing.id)] });
      message.success('Фото загружено');
    } catch {
      message.error('Ошибка загрузки фото');
    } finally {
      setUploading(false);
    }
    return false; // предотвращение стандартного поведения загрузки
  };

  const columns = [
    { title: 'Название', dataIndex: 'name', key: 'name', render: (n: string, r: Property) => <Link to={`/properties/${r.id}`}>{n}</Link> },
    {
      title: 'Адрес', key: 'address', ellipsis: true,
      render: (_: unknown, r: Property) => {
        const parts = [r.address];
        if (r.city && !r.address.toLowerCase().includes(r.city.toLowerCase())) {
          parts.unshift(r.city);
        }
        return parts.join(', ');
      },
    },
    {
      title: 'Тип', dataIndex: 'type', key: 'type',
      render: (t: PropertyType) => <Tag>{PROPERTY_TYPE_MAP[t] || t}</Tag>,
    },
    { title: 'Площадь', dataIndex: 'totalArea', key: 'area', render: (v: number) => formatArea(v) },
    {
      title: 'Заполняемость', key: 'occupancy', width: 160,
      render: (_: unknown, r: Property) => {
        const occ = occupancyMap.get(r.id);
        if (!occ || occ.totalUnits === 0) return <span style={{ color: '#999' }}>—</span>;
        const pct = Math.round(occ.occupancyRate);
        const color = pct >= 80 ? '#52c41a' : pct >= 50 ? '#faad14' : '#ff4d4f';
        return (
          <Tooltip title={`${occ.rentedUnits} из ${occ.totalUnits} помещений`}>
            <Progress percent={pct} size="small" strokeColor={color} style={{ minWidth: 100 }} />
          </Tooltip>
        );
      },
    },
    { title: 'Этажей', dataIndex: 'floorsCount', key: 'floors', render: (v: number | null) => v ?? '---' },
    { title: 'Опубликован', dataIndex: 'isPublished', key: 'pub', render: (v: boolean) => v ? <Tag color="green">Да</Tag> : <Tag>Нет</Tag> },
    {
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: Property) => (
        <Space>
          <Link to={`/properties/${r.id}`}><Button icon={<EyeOutlined />} size="small" /></Link>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />
          <Popconfirm title="Удалить объект?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const imageTabItems = [
    ...(editing
      ? [{
          key: 'upload',
          label: <span><UploadOutlined /> Загрузить файл</span>,
          children: (
            <div>
              {previewUrl && (
                <div style={{ marginBottom: 12, textAlign: 'center' }}>
                  <Image
                    src={previewUrl}
                    alt="Фото объекта"
                    style={{ maxHeight: 160, objectFit: 'cover', borderRadius: 8 }}
                    fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='14'%3EНет фото%3C/text%3E%3C/svg%3E"
                  />
                </div>
              )}
              <Dragger
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleImageUpload as (file: RcFile, fileList: RcFile[]) => boolean}
                disabled={uploading}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">
                  {uploading ? 'Загрузка...' : 'Нажмите или перетащите файл для загрузки'}
                </p>
                <p className="ant-upload-hint">Поддерживаются изображения JPG, PNG, WebP до 10 МБ</p>
              </Dragger>
            </div>
          ),
        }]
      : []),
    {
      key: 'link',
      label: <span><LinkOutlined /> Вставить ссылку</span>,
      children: (
        <div>
          {previewUrl && imageTab === 'link' && (
            <div style={{ marginBottom: 12, textAlign: 'center' }}>
              <Image
                src={previewUrl}
                alt="Фото объекта"
                style={{ maxHeight: 160, objectFit: 'cover', borderRadius: 8 }}
                fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='14'%3EНет фото%3C/text%3E%3C/svg%3E"
              />
            </div>
          )}
          <Form.Item name="imageUrl" noStyle>
            <Input
              placeholder="https://example.com/photo.jpg"
              onChange={(e) => setPreviewUrl(e.target.value || undefined)}
            />
          </Form.Item>
          {!editing && (
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
              Загрузка файла будет доступна после сохранения объекта
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Объекты недвижимости</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить объект</Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Всего объектов" value={data?.total ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Помещений" value={data?.data?.reduce((s: number, p: any) => s + (p._count?.units ?? p.unitsCount ?? 0), 0) ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Общая площадь" value={data?.data?.reduce((s: number, p: any) => s + Number(p.totalArea || 0), 0).toLocaleString('ru-RU') ?? '—'} suffix="м²" /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Опубликовано" value={data?.data?.filter((p: any) => p.isPublished).length ?? 0} /></Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }}>
        <Input prefix={<SearchOutlined />} placeholder="Поиск..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} allowClear style={{ width: 260 }} />
        <Select placeholder="Тип" allowClear options={typeOptions} value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} style={{ width: 180 }} />
      </Space>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Добавьте первый объект недвижимости"><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить объект</Button></Empty> }}
      />

      <Modal
        title={editing ? 'Редактировать объект' : 'Новый объект'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditing(null); setPreviewUrl(undefined); }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="Сохранить"
        cancelText="Отмена"
        width={window.innerWidth < 768 ? '95%' : 600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Адрес" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="city" label="Город">
            <Input placeholder="Москва" />
          </Form.Item>
          <Form.Item name="type" label="Тип" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <Select options={typeOptions} />
          </Form.Item>
          <Form.Item name="totalArea" label="Общая площадь (м2)" rules={[{ required: true, message: 'Обязательное поле' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="floorsCount" label="Количество этажей">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="yearBuilt" label="Год постройки">
            <InputNumber min={1900} max={2030} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item label="Фото объекта">
            <Tabs
              activeKey={imageTab}
              onChange={setImageTab}
              items={imageTabItems}
              size="small"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PropertiesPage;
