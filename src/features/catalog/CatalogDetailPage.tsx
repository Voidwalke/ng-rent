import React, { useState, useMemo } from 'react';
import { Typography, Card, Carousel, Descriptions, Image, Table, Tag, Button, Skeleton, Space, Row, Col, Statistic, Modal, Form, Input, DatePicker, Select, Alert, message, theme } from 'antd';
import { ArrowLeftOutlined, EnvironmentOutlined, BankOutlined, SendOutlined, SortAscendingOutlined, SortDescendingOutlined, PictureOutlined, LeftOutlined, RightOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { catalogApi, propertiesApi, tenantPortalApi } from '../../api/endpoints';
import { formatArea, formatMoney } from '../../lib/format';
import { PROPERTY_TYPE_MAP, UNIT_STATUS_MAP } from '../../lib/constants';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import type { Property, PropertyImage, Unit, UnitStatus } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

type CatalogPropertyDetail = Property & { units?: Unit[]; tenant?: { name: string; contactEmail?: string; contactPhone?: string } };

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const CatalogDetailPage: React.FC = () => {
  const { token } = theme.useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const [applyModal, setApplyModal] = useState(false);
  const [authModal, setAuthModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [form] = Form.useForm();

  // Фильтры помещений
  const [floorFilter, setFloorFilter] = useState<number | undefined>();
  const [priceSort, setPriceSort] = useState<'asc' | 'desc' | null>(null);

  // Диапазон цен из URL-параметров страницы каталога
  const urlPriceMin = searchParams.get('priceMin') ? Number(searchParams.get('priceMin')) : null;
  const urlPriceMax = searchParams.get('priceMax') ? Number(searchParams.get('priceMax')) : null;

  const { data: propertyData, isLoading } = useQuery<CatalogPropertyDetail>({
    queryKey: ['catalog-property', id],
    queryFn: () => catalogApi.propertyDetail(Number(id)),
    enabled: !!id,
  });

  // Изображения галереи приходят из публичного API детализации объекта (авторизация не нужна)
  const galleryImages = propertyData?.images || [];

  const applyMutation = useMutation({
    mutationFn: (data: any) => tenantPortalApi.createApplication(data),
    onSuccess: () => {
      message.success('Заявка отправлена! Вы можете отслеживать статус заявки в разделе «Мои заявки» личного кабинета. Обычно ответ приходит в течение 1-3 рабочих дней.');
      setApplyModal(false);
      form.resetFields();
      setTimeout(() => navigate('/my/applications'), 2500);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      message.error(typeof msg === 'string' ? msg : 'Ошибка отправки заявки. Возможно, помещение недоступно.');
    },
  });

  const property = propertyData;
  usePageTitle(property?.name || 'Объект');

  const allAvailableUnits = useMemo(
    () => (propertyData?.units || []).filter((u) => u.status === 'available'),
    [propertyData],
  );

  // Уникальные номера этажей для выпадающего списка
  const floorOptions = useMemo(() => {
    const floors = [...new Set(allAvailableUnits.map((u) => u.floor))].sort((a, b) => a - b);
    return floors.map((f) => ({ value: f, label: `${f} этаж` }));
  }, [allAvailableUnits]);

  // Отфильтрованные и отсортированные помещения
  const availableUnits = useMemo(() => {
    let items = [...allAvailableUnits];

    // Фильтр по этажу
    if (floorFilter != null) {
      items = items.filter((u) => u.floor === floorFilter);
    }

    // Диапазон цен со страницы каталога
    if (urlPriceMin != null) {
      items = items.filter((u) => u.priceMonth >= urlPriceMin);
    }
    if (urlPriceMax != null) {
      items = items.filter((u) => u.priceMonth <= urlPriceMax);
    }

    // Сортировка по цене
    if (priceSort === 'asc') {
      items.sort((a, b) => a.priceMonth - b.priceMonth);
    } else if (priceSort === 'desc') {
      items.sort((a, b) => b.priceMonth - a.priceMonth);
    }

    return items;
  }, [allAvailableUnits, floorFilter, priceSort, urlPriceMin, urlPriceMax]);

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!property) return null;

  const handleApply = (unit: Unit) => {
    setSelectedUnit(unit);
    const accessToken = localStorage.getItem('accessToken');
    if (isAuthenticated && accessToken) {
      setApplyModal(true);
    } else {
      setAuthModal(true);
    }
  };

  const handleSubmitApplication = async (values: any) => {
    if (!selectedUnit) return;
    applyMutation.mutate({
      unitId: selectedUnit.id,
      desiredStart: values.dates[0].format('YYYY-MM-DD'),
      desiredEnd: values.dates[1].format('YYYY-MM-DD'),
      comment: values.comment || '',
    });
  };

  const typeColor = property.type === 'office' ? '#2563eb' : property.type === 'retail' ? '#7c3aed' : property.type === 'warehouse' ? '#059669' : '#f59e0b';

  const handlePriceSortToggle = () => {
    if (priceSort === null) setPriceSort('asc');
    else if (priceSort === 'asc') setPriceSort('desc');
    else setPriceSort(null);
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
    <div style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      {/* Шапка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px clamp(16px, 4vw, 48px)', background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, flexWrap: 'wrap', gap: 12 }}>
        <Space align="center" size={12}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
              N
            </div>
            <Text strong style={{ fontSize: 20 }}>NGRent</Text>
          </Link>
        </Space>
        <Space wrap>
          {isAuthenticated ? (
            <Button type="primary" onClick={() => navigate('/my')}>Личный кабинет</Button>
          ) : (
            <>
              <Link to="/login"><Button>Войти</Button></Link>
              <Link to="/register"><Button type="primary">Регистрация</Button></Link>
            </>
          )}
          <Button type="text" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Space>
      </div>

      <div style={{ padding: '24px clamp(16px, 4vw, 48px)', maxWidth: 1200, margin: '0 auto' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/catalog')} style={{ marginBottom: 16 }}>Назад к каталогу</Button>

        {/* Галерея изображений / главный блок */}
        {galleryImages.length > 0 ? (
          <div style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden' }}>
            <Carousel
              autoplay
              dots
              arrows
              prevArrow={<LeftOutlined />}
              nextArrow={<RightOutlined />}
            >
              {property.imageUrl && (
                <div key="hero">
                  <div style={{ height: 'clamp(200px, 30vw, 320px)', background: token.colorBgLayout }}>
                    <img
                      src={property.imageUrl}
                      alt={property.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                </div>
              )}
              {galleryImages.map((img) => (
                <div key={img.id}>
                  <div style={{ height: 'clamp(200px, 30vw, 320px)', background: token.colorBgLayout }}>
                    <img
                      src={img.imageUrl}
                      alt={img.caption || property.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                </div>
              ))}
            </Carousel>
            {/* Миниатюры */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto', paddingBottom: 4 }}>
              <Image.PreviewGroup>
                {property.imageUrl && (
                  <Image
                    src={property.imageUrl}
                    alt="Главное фото"
                    width={80}
                    height={60}
                    style={{ objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                  />
                )}
                {galleryImages.map((img) => (
                  <Image
                    key={img.id}
                    src={img.imageUrl}
                    alt={img.caption || 'Фото'}
                    width={80}
                    height={60}
                    style={{ objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                  />
                ))}
              </Image.PreviewGroup>
            </div>
          </div>
        ) : property.imageUrl ? (
          <div style={{
            height: 280,
            borderRadius: 12,
            marginBottom: 24,
            overflow: 'hidden',
            background: token.colorBgLayout,
          }}>
            <img
              src={property.imageUrl}
              alt={property.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = 'none';
                el.parentElement!.style.background = `linear-gradient(135deg, ${typeColor}30, ${typeColor}10)`;
                el.parentElement!.style.display = 'flex';
                el.parentElement!.style.alignItems = 'center';
                el.parentElement!.style.justifyContent = 'center';
              }}
            />
          </div>
        ) : (
          <div style={{
            height: 220,
            borderRadius: 12,
            marginBottom: 24,
            background: `linear-gradient(135deg, ${typeColor}30, ${typeColor}10)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BankOutlined style={{ fontSize: 64, color: typeColor }} />
          </div>
        )}

        {/* Главный блок */}
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <Tag color={property.type === 'office' ? 'blue' : property.type === 'retail' ? 'purple' : property.type === 'warehouse' ? 'green' : 'orange'}>
                {PROPERTY_TYPE_MAP[property.type] || property.type}
              </Tag>
              <Title level={2} style={{ marginTop: 8, marginBottom: 4 }}>{property.name}</Title>
              {property.tenant?.name && (
                <div style={{ marginBottom: 4 }}>
                  <Space>
                    <BankOutlined style={{ color: '#2563eb' }} />
                    <Text style={{ color: '#2563eb' }}>{property.tenant.name}</Text>
                  </Space>
                  {(property.tenant.contactPhone || property.tenant.contactEmail) && (
                    <Text type="secondary" style={{ marginLeft: 12, fontSize: 13 }}>
                      {property.tenant.contactPhone && <span>{property.tenant.contactPhone}</span>}
                      {property.tenant.contactPhone && property.tenant.contactEmail && <span> · </span>}
                      {property.tenant.contactEmail && <a href={`mailto:${property.tenant.contactEmail}`}>{property.tenant.contactEmail}</a>}
                    </Text>
                  )}
                </div>
              )}
              <Space>
                <EnvironmentOutlined style={{ color: token.colorTextQuaternary }} />
                <Text type="secondary" style={{ fontSize: 16 }}>{property.address}{property.city ? `, ${property.city}` : ''}</Text>
              </Space>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>
                <Text type="secondary">Свободных помещений:</Text>
                <Title level={3} style={{ margin: 0, color: '#2563eb' }}>{availableUnits.length}</Title>
              </div>
            </div>
          </div>
        </Card>

        {/* Статистика */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}><Card><Statistic title="Общая площадь" value={formatArea(property.totalArea)} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title="Этажей" value={property.floorsCount ?? '—'} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title="Год постройки" value={property.yearBuilt ?? '—'} /></Card></Col>
          <Col xs={12} sm={6}><Card><Statistic title="Всего помещений" value={propertyData?.units?.length ?? '—'} /></Card></Col>
        </Row>

        {/* Описание */}
        {property.description && (
          <Card title="Описание" style={{ marginBottom: 24 }}>
            <Paragraph>{property.description}</Paragraph>
          </Card>
        )}

        {/* Условия аренды */}
        <Card title="Условия аренды" style={{ marginBottom: 24 }}>
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Минимальный срок аренды">от 6 месяцев</Descriptions.Item>
            <Descriptions.Item label="Обеспечительный платёж (депозит)">1 месяц аренды</Descriptions.Item>
            <Descriptions.Item label="Оплата">до N-го числа каждого месяца</Descriptions.Item>
            <Descriptions.Item label="Неустойка за просрочку">0,1% в день</Descriptions.Item>
          </Descriptions>
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
            Точные условия определяются в договоре аренды
          </Text>
        </Card>

        {/* Доступные помещения */}
        <Card
          title="Доступные помещения"
          extra={
            <Space wrap>
              <Select
                placeholder="Этаж"
                allowClear
                options={floorOptions}
                value={floorFilter}
                onChange={setFloorFilter}
                style={{ width: 140 }}
              />
              <Button
                icon={priceSort === 'asc' ? <SortAscendingOutlined /> : priceSort === 'desc' ? <SortDescendingOutlined /> : <SortAscendingOutlined />}
                type={priceSort ? 'primary' : 'default'}
                onClick={handlePriceSortToggle}
              >
                Цена {priceSort === 'asc' ? '(по возр.)' : priceSort === 'desc' ? '(по убыв.)' : ''}
              </Button>
            </Space>
          }
        >
          {(urlPriceMin != null || urlPriceMax != null) && (
            <div style={{ marginBottom: 12 }}>
              <Tag color="blue">
                Фильтр по цене:{' '}
                {urlPriceMin != null ? `от ${formatMoney(urlPriceMin)}` : ''}
                {urlPriceMin != null && urlPriceMax != null ? ' ' : ''}
                {urlPriceMax != null ? `до ${formatMoney(urlPriceMax)}` : ''}
              </Tag>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete('priceMin');
                  params.delete('priceMax');
                  navigate({ search: params.toString() }, { replace: true });
                }}
              >
                Сбросить
              </Button>
            </div>
          )}
          <Table
            columns={unitColumns}
            dataSource={availableUnits}
            rowKey="id"
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'Нет доступных помещений' }}
          />
        </Card>
      </div>

      {/* Модалка заявки */}
      <Modal
        title={`Заявка на помещение ${selectedUnit?.unitNumber || `#${selectedUnit?.id}`}`}
        open={applyModal}
        onCancel={() => { setApplyModal(false); form.resetFields(); }}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Объект: {property.name} | Этаж: {selectedUnit?.floor} | Площадь: {selectedUnit ? formatArea(selectedUnit.areaSqm) : ''} | Цена: {selectedUnit ? formatMoney(selectedUnit.priceMonth) : ''}/мес
          </Text>
        </div>
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

      {/* Модалка авторизации */}
      <Modal
        title="Войдите или зарегистрируйтесь"
        open={authModal}
        onCancel={() => setAuthModal(false)}
        footer={null}
      >
        <p>Для подачи заявки на аренду необходима учётная запись.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Button type="primary" block size="large" onClick={() => { setAuthModal(false); navigate(`/login?redirect=/catalog/${id}`); }}>
            Войти
          </Button>
          <Button block size="large" onClick={() => { setAuthModal(false); navigate(`/register?redirect=/catalog/${id}`); }}>
            Регистрация
          </Button>
        </div>
        <p style={{ color: token.colorTextQuaternary, fontSize: 13, marginTop: 16, textAlign: 'center' }}>
          После входа вы сможете подать заявку на выбранное помещение
        </p>
      </Modal>
    </div>
  );
};

export default CatalogDetailPage;
