import React, { useRef } from 'react';
import { Typography, Card, Row, Col, Descriptions, Table, Tag, Button, Skeleton, Space, Statistic, Image, Upload, Popconfirm, message, theme } from 'antd';
import { CloudUploadOutlined, StopOutlined, BankOutlined, PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertiesApi, unitsApi } from '../../api/endpoints';
import { formatDate, formatMoney, formatArea } from '../../lib/format';
import { PROPERTY_TYPE_MAP, UNIT_STATUS_MAP } from '../../lib/constants';
import type { Property, PropertyImage, PropertyStats, Unit, UnitStatus } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title } = Typography;

const PropertyDetailPage: React.FC = () => {
  const { token } = theme.useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: property, isLoading } = useQuery<Property>({
    queryKey: ['property', id],
    queryFn: () => propertiesApi.get(Number(id)),
    enabled: !!id,
  });

  usePageTitle(property?.name || 'Объект');

  const { data: stats } = useQuery<PropertyStats>({
    queryKey: ['property-stats', id],
    queryFn: () => propertiesApi.stats(Number(id)),
    enabled: !!id,
  });

  const { data: unitsData } = useQuery<PaginatedResponse<Unit>>({
    queryKey: ['property-units', id],
    queryFn: () => unitsApi.list({ propertyId: Number(id), limit: 100 }),
    enabled: !!id,
  });

  const { data: galleryImages = [] } = useQuery<PropertyImage[]>({
    queryKey: ['property-images', id],
    queryFn: () => propertiesApi.getImages(Number(id)),
    enabled: !!id,
  });

  const uploadGalleryMutation = useMutation({
    mutationFn: (file: File) => propertiesApi.addGalleryImage(Number(id), file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-images', id] });
      message.success('Изображение загружено');
    },
    onError: () => message.error('Ошибка загрузки изображения'),
  });

  const deleteGalleryMutation = useMutation({
    mutationFn: (imageId: number) => propertiesApi.deleteGalleryImage(Number(id), imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-images', id] });
      message.success('Изображение удалено');
    },
    onError: () => message.error('Ошибка удаления'),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ imageId, direction }: { imageId: number; direction: 'up' | 'down' }) =>
      propertiesApi.reorderImage(Number(id), imageId, direction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-images', id] });
    },
    onError: () => message.error('Ошибка перемещения'),
  });

  const publishMutation = useMutation({
    mutationFn: () => propertiesApi.publish(Number(id)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['property', id] }); message.success('Объект опубликован'); },
    onError: () => message.error('Ошибка публикации'),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => propertiesApi.unpublish(Number(id)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['property', id] }); message.success('Объект снят с публикации'); },
    onError: () => message.error('Ошибка'),
  });

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!property) return null;

  const typeLabel = PROPERTY_TYPE_MAP[property.type] || property.type;

  const unitColumns = [
    { title: '№', dataIndex: 'unitNumber', key: 'num', render: (v: string, r: Unit) => <Link to={`/units/${r.id}`}>{v || `#${r.id}`}</Link> },
    { title: 'Этаж', dataIndex: 'floor', key: 'floor' },
    { title: 'Площадь', dataIndex: 'areaSqm', key: 'area', render: (v: number) => formatArea(v) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: UnitStatus) => {
        const m = UNIT_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    { title: 'Цена/мес', dataIndex: 'priceMonth', key: 'price', render: (v: number) => formatMoney(v) },
  ];

  return (
    <div>
      <PageBreadcrumb items={[{ title: 'Объекты', path: '/properties' }, { title: property.name }]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>{property.name}</Title>
          <Tag>{typeLabel}</Tag>
        </Space>
        <Space>
          <Tag color={property.isPublished ? 'green' : 'default'}>
            {property.isPublished ? 'Опубликован' : 'Не опубликован'}
          </Tag>
          {property.isPublished ? (
            <Button icon={<StopOutlined />} onClick={() => unpublishMutation.mutate()} loading={unpublishMutation.isPending}>Снять с публикации</Button>
          ) : (
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => publishMutation.mutate()} loading={publishMutation.isPending}>Опубликовать</Button>
          )}
        </Space>
      </div>

      {/* Галерея изображений */}
      <Card
        title="Фотогалерея"
        style={{ marginBottom: 24 }}
        extra={
          <Upload
            showUploadList={false}
            accept="image/*"
            beforeUpload={(file) => {
              uploadGalleryMutation.mutate(file);
              return false;
            }}
          >
            <Button
              icon={<PlusOutlined />}
              loading={uploadGalleryMutation.isPending}
            >
              Добавить фото
            </Button>
          </Upload>
        }
      >
        {galleryImages.length > 0 || property.imageUrl ? (
          <Image.PreviewGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                {property.imageUrl ? (
                  <Image
                    src={property.imageUrl}
                    alt="Главное фото"
                    width={160}
                    height={120}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                    fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='12'%3EФото%3C/text%3E%3C/svg%3E"
                  />
                ) : (
                  <div style={{ width: 160, height: 120, borderRadius: 8, background: token.colorBgLayout, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${token.colorBorder}` }}>
                    <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>Нет фото</span>
                  </div>
                )}
                <Tag color="blue" style={{ position: 'absolute', top: 4, left: 4, margin: 0, fontSize: 11 }}>Главное</Tag>
                <Upload
                  showUploadList={false}
                  accept="image/*"
                  beforeUpload={(file) => {
                    propertiesApi.uploadImage(Number(id), file).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['property', id] });
                      message.success('Главное фото обновлено');
                    }).catch(() => message.error('Ошибка загрузки'));
                    return false;
                  }}
                >
                  <Button size="small" style={{ position: 'absolute', bottom: 4, right: 4 }}>
                    {property.imageUrl ? 'Заменить' : 'Загрузить'}
                  </Button>
                </Upload>
              </div>
              {galleryImages.map((img, idx) => (
                <div key={img.id} style={{ position: 'relative' }}>
                  <Image
                    src={img.imageUrl}
                    alt={img.caption || 'Фото объекта'}
                    width={160}
                    height={120}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                    fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='12'%3EФото%3C/text%3E%3C/svg%3E"
                  />
                  <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
                    {idx > 0 && (
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        onClick={() => reorderMutation.mutate({ imageId: img.id, direction: 'up' })}
                        loading={reorderMutation.isPending}
                        style={{ background: 'rgba(255,255,255,0.85)', borderRadius: '50%' }}
                      />
                    )}
                    {idx < galleryImages.length - 1 && (
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        onClick={() => reorderMutation.mutate({ imageId: img.id, direction: 'down' })}
                        loading={reorderMutation.isPending}
                        style={{ background: 'rgba(255,255,255,0.85)', borderRadius: '50%' }}
                      />
                    )}
                    <Popconfirm
                      title="Удалить изображение?"
                      onConfirm={() => deleteGalleryMutation.mutate(img.id)}
                      okText="Да"
                      cancelText="Нет"
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        style={{ background: 'rgba(255,255,255,0.85)', borderRadius: '50%' }}
                      />
                    </Popconfirm>
                  </div>
                  {img.caption && (
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Image.PreviewGroup>
        ) : (
          <div style={{
            height: 120,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #2563eb22, #2563eb08)',
            borderRadius: 8,
          }}>
            <BankOutlined style={{ fontSize: 48, color: '#2563eb' }} />
          </div>
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card><Statistic title="Всего помещений" value={stats ? Object.values(stats.unitsByStatus).reduce((a, b) => a + b, 0) : 0} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Арендовано" value={stats?.unitsByStatus?.rented ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Заполняемость" value={`${stats?.occupancyRate ?? 0}%`} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Площадь (аренда)" value={formatArea(Number(stats?.rentedArea ?? 0))} /></Card></Col>
      </Row>

      <Card title="Информация" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Адрес">{property.address}</Descriptions.Item>
          <Descriptions.Item label="Город">{property.city || '—'}</Descriptions.Item>
          <Descriptions.Item label="Общая площадь">{formatArea(property.totalArea)}</Descriptions.Item>
          <Descriptions.Item label="Этажей">{property.floorsCount ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Год постройки">{property.yearBuilt ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Создан">{formatDate(property.createdAt)}</Descriptions.Item>
          {property.description && <Descriptions.Item label="Описание" span={2}>{property.description}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Card title="Помещения">
        <Table
          columns={unitColumns}
          dataSource={unitsData?.data || []}
          rowKey="id"
          pagination={false}
          size="small"
          onRow={(r) => ({ onClick: () => navigate(`/units/${r.id}`), style: { cursor: 'pointer' } })}
        />
      </Card>
    </div>
  );
};

export default PropertyDetailPage;
