import React, { useState } from 'react';
import { Typography, Input, Select, Row, Col, Card, Tag, Button, Skeleton, Space, Drawer, Descriptions, Table, Statistic, Form, DatePicker, Modal, message } from 'antd';
import { SearchOutlined, EnvironmentOutlined, ExpandOutlined, BankOutlined, SendOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { catalogApi, tenantPortalApi } from '../../api/endpoints';
import { formatArea, formatMoney } from '../../lib/format';
import { PROPERTY_TYPE_MAP, UNIT_STATUS_MAP } from '../../lib/constants';
import { useAuthStore } from '../../store/auth';
import type { Property, Unit, UnitStatus } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';

type CatalogProperty = Property & {
  tenant?: { name: string };
  _count?: { units: number };
};

type CatalogPropertyDetail = Property & { units?: Unit[]; tenant?: { name: string } };

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const typeOptions = Object.entries(PROPERTY_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }));

const TenantUnits: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [applyModal, setApplyModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery<PaginatedResponse<CatalogProperty>>({
    queryKey: ['catalog-properties'],
    queryFn: () => catalogApi.properties({ limit: 100 }),
  });

  const { data: propertyDetail, isLoading: detailLoading } = useQuery<CatalogPropertyDetail>({
    queryKey: ['catalog-property-detail', selectedPropertyId],
    queryFn: () => catalogApi.propertyDetail(selectedPropertyId!),
    enabled: !!selectedPropertyId && drawerOpen,
  });

  const applyMutation = useMutation({
    mutationFn: (dto: any) => tenantPortalApi.createApplication(dto),
    onSuccess: () => {
      message.success('Заявка отправлена!');
      setApplyModal(false);
      form.resetFields();
      setTimeout(() => navigate('/my/applications'), 1000);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      message.error(typeof msg === 'string' ? msg : 'Ошибка отправки заявки');
    },
  });

  const filtered = React.useMemo(() => {
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

  const availableUnits = React.useMemo(() => {
    if (!propertyDetail?.units) return [];
    return propertyDetail.units.filter((u) => u.status === 'available');
  }, [propertyDetail]);

  const handleCardClick = (p: CatalogProperty) => {
    setSelectedPropertyId(p.id);
    setDrawerOpen(true);
  };

  const handleApply = (unit: Unit) => {
    setSelectedUnit(unit);
    setApplyModal(true);
  };

  const handleSubmitApplication = (values: any) => {
    if (!selectedUnit) return;
    applyMutation.mutate({
      unitId: selectedUnit.id,
      desiredStart: values.dates[0].format('YYYY-MM-DD'),
      desiredEnd: values.dates[1].format('YYYY-MM-DD'),
      comment: values.comment || '',
    });
  };

  const unitColumns = [
    { title: '№', dataIndex: 'unitNumber', key: 'num', render: (v: string) => v || '—' },
    { title: 'Этаж', dataIndex: 'floor', key: 'floor' },
    { title: 'Площадь', dataIndex: 'areaSqm', key: 'area', render: (v: number) => formatArea(v) },
    { title: 'Цена/мес', dataIndex: 'priceMonth', key: 'price', render: (v: number) => formatMoney(v) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: UnitStatus) => {
        const m = UNIT_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    {
      title: '', key: 'action',
      render: (_: unknown, r: Unit) => r.status === 'available' ? (
        <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleApply(r)}>
          Подать заявку
        </Button>
      ) : null,
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Доступные помещения</Title>

      <Space style={{ marginBottom: 24 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Поиск по названию или адресу..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 320 }}
        />
        <Select
          placeholder="Тип объекта"
          allowClear
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 180 }}
        />
      </Space>

      {isLoading ? (
        <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((p) => (
            <Col xs={24} sm={12} lg={8} key={p.id}>
              <Card
                hoverable
                onClick={() => handleCardClick(p)}
                cover={
                  p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} style={{ height: 140, objectFit: 'cover', width: '100%' }} />
                  ) : (
                    <div style={{
                      height: 140,
                      background: `linear-gradient(135deg, ${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}22, ${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}08)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderBottom: '1px solid #f0f0f0',
                    }}>
                      <BankOutlined style={{ fontSize: 40, color: p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b' }} />
                    </div>
                  )
                }
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Tag color={p.type === 'office' ? 'blue' : p.type === 'retail' ? 'purple' : p.type === 'warehouse' ? 'green' : 'orange'}>
                    {PROPERTY_TYPE_MAP[p.type] || p.type}
                  </Tag>
                  {p._count?.units != null && <Tag color="green">{p._count.units} своб.</Tag>}
                </div>
                <Title level={5} style={{ marginBottom: 4 }}>{p.name}</Title>
                <Space>
                  <EnvironmentOutlined style={{ color: '#999' }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>{p.address}</Text>
                </Space>
                <br />
                <Space style={{ marginTop: 4 }}>
                  <ExpandOutlined style={{ color: '#999' }} />
                  <Text type="secondary" style={{ fontSize: 13 }}>{formatArea(p.totalArea)}</Text>
                </Space>
              </Card>
            </Col>
          ))}
          {filtered.length === 0 && (
            <Col span={24}>
              <div style={{ textAlign: 'center', padding: 48 }}>
                <Text type="secondary">Объекты не найдены</Text>
              </div>
            </Col>
          )}
        </Row>
      )}

      {/* Панель деталей объекта */}
      <Drawer
        title={propertyDetail?.name || 'Объект'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedPropertyId(null); }}
        width={Math.min(600, window.innerWidth)}
      >
        {detailLoading ? (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
        ) : propertyDetail ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <Tag color={propertyDetail.type === 'office' ? 'blue' : propertyDetail.type === 'retail' ? 'purple' : propertyDetail.type === 'warehouse' ? 'green' : 'orange'} style={{ marginBottom: 8 }}>
                {PROPERTY_TYPE_MAP[propertyDetail.type] || propertyDetail.type}
              </Tag>
              <div style={{ marginBottom: 4 }}>{propertyDetail.address}{propertyDetail.city ? `, ${propertyDetail.city}` : ''}</div>
              <Text type="secondary">Площадь: {formatArea(propertyDetail.totalArea)}{propertyDetail.floorsCount ? ` · ${propertyDetail.floorsCount} этажей` : ''}</Text>
              {propertyDetail.tenant?.name && (
                <div><Text type="secondary">УК: {propertyDetail.tenant.name}</Text></div>
              )}
              <div style={{ marginTop: 4 }}><Tag color="green">{availableUnits.length} свободных помещений</Tag></div>
            </div>

            {propertyDetail.description && (
              <div style={{ marginBottom: 24 }}>
                <Text strong>Описание</Text>
                <div style={{ marginTop: 8, color: '#666' }}>{propertyDetail.description}</div>
              </div>
            )}

            <Title level={5}>Доступные помещения</Title>
            <Table
              columns={unitColumns}
              dataSource={availableUnits}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: 'Нет доступных помещений' }}
            />
          </>
        ) : null}
      </Drawer>

      {/* Модалка заявки */}
      <Modal
        title={`Заявка на помещение ${selectedUnit?.unitNumber || `#${selectedUnit?.id}`}`}
        open={applyModal}
        onCancel={() => { setApplyModal(false); form.resetFields(); }}
        footer={null}
      >
        {selectedUnit && propertyDetail && (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Объект: {propertyDetail.name} | Этаж: {selectedUnit.floor} | Площадь: {formatArea(selectedUnit.areaSqm)} | Цена: {formatMoney(selectedUnit.priceMonth)}/мес
            </Text>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleSubmitApplication}>
          <Form.Item name="dates" label="Желаемый период аренды" rules={[{ required: true, message: 'Выберите период' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="comment" label="Комментарий">
            <Input.TextArea rows={3} placeholder="Дополнительные пожелания..." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={applyMutation.isPending} block size="large">
              Отправить заявку
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TenantUnits;
