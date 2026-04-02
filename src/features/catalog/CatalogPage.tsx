import React, { useState } from 'react';
import { Typography, Input, InputNumber, Select, Row, Col, Card, Tag, Button, Skeleton, Space, Divider, theme } from 'antd';
import { SearchOutlined, EnvironmentOutlined, ExpandOutlined, BankOutlined, FilterOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { catalogApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import { formatArea } from '../../lib/format';
import { PROPERTY_TYPE_MAP } from '../../lib/constants';
import type { Property } from '../../types/models';

type CatalogProperty = Property & {
  tenant?: { name: string; slug: string };
  _count?: { units: number };
};
import type { PaginatedResponse } from '../../types/api';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const typeOptions = Object.entries(PROPERTY_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }));

const CatalogPage: React.FC = () => {
  usePageTitle('Каталог объектов');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') || '';
  const typeFilter = searchParams.get('type') || undefined;
  const priceMin = searchParams.get('priceMin') ? Number(searchParams.get('priceMin')) : null;
  const priceMax = searchParams.get('priceMax') ? Number(searchParams.get('priceMax')) : null;
  const areaMin = searchParams.get('areaMin') ? Number(searchParams.get('areaMin')) : null;
  const areaMax = searchParams.get('areaMax') ? Number(searchParams.get('areaMax')) : null;

  const updateParam = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  const setSearch = (v: string) => updateParam('q', v || null);
  const setTypeFilter = (v: string | undefined) => updateParam('type', v ?? null);
  const setPriceMin = (v: number | null) => updateParam('priceMin', v != null ? String(v) : null);
  const setPriceMax = (v: number | null) => updateParam('priceMax', v != null ? String(v) : null);
  const setAreaMin = (v: number | null) => updateParam('areaMin', v != null ? String(v) : null);
  const setAreaMax = (v: number | null) => updateParam('areaMax', v != null ? String(v) : null);

  const [showFilters, setShowFilters] = useState(priceMin != null || priceMax != null || areaMin != null || areaMax != null);

  const { data, isLoading } = useQuery<PaginatedResponse<CatalogProperty>>({
    queryKey: ['catalog-properties'],
    queryFn: () => catalogApi.properties({ limit: 100 }),
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
    // Фильтры по цене (priceMin/priceMax) применяются на уровне помещений в CatalogDetailPage,
    // а не на уровне объектов — у объектов нет единой цены.
    if (areaMin != null) {
      items = items.filter((p) => p.totalArea >= areaMin);
    }
    if (areaMax != null) {
      items = items.filter((p) => p.totalArea <= areaMax);
    }
    return items;
  }, [data, search, typeFilter, priceMin, priceMax, areaMin, areaMax]);

  const hasActiveFilters = priceMin != null || priceMax != null || areaMin != null || areaMax != null;

  const handleResetFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('priceMin');
      next.delete('priceMax');
      next.delete('areaMin');
      next.delete('areaMax');
      return next;
    }, { replace: true });
  };

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

      {/* Поиск */}
      <div style={{ padding: '24px clamp(16px, 4vw, 48px)', maxWidth: 1200, margin: '0 auto' }}>
        <Title level={2} style={{ marginBottom: 24 }}>Каталог объектов</Title>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input prefix={<SearchOutlined />} placeholder="Поиск по названию или адресу..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: '100%', maxWidth: 360 }} size="large" />
          <Select placeholder="Тип объекта" allowClear options={typeOptions} value={typeFilter} onChange={setTypeFilter} style={{ width: 200 }} size="large" />
          <Button
            icon={<FilterOutlined />}
            size="large"
            type={showFilters ? 'primary' : 'default'}
            onClick={() => setShowFilters(!showFilters)}
          >
            Фильтры{hasActiveFilters ? ' *' : ''}
          </Button>
        </Space>

        {/* Расширенные фильтры */}
        {showFilters && (
          <Card size="small" style={{ marginBottom: 24 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} sm={12} md={6}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Цена, руб./мес</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    placeholder="от"
                    value={priceMin}
                    onChange={(v) => setPriceMin(v)}
                    min={0}
                    style={{ width: '50%' }}
                    formatter={(v) => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                    parser={(v) => Number((v || '').replace(/\s/g, ''))}
                  />
                  <InputNumber
                    placeholder="до"
                    value={priceMax}
                    onChange={(v) => setPriceMax(v)}
                    min={0}
                    style={{ width: '50%' }}
                    formatter={(v) => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                    parser={(v) => Number((v || '').replace(/\s/g, ''))}
                  />
                </Space.Compact>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Площадь, м²</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    placeholder="от"
                    value={areaMin}
                    onChange={(v) => setAreaMin(v)}
                    min={0}
                    style={{ width: '50%' }}
                  />
                  <InputNumber
                    placeholder="до"
                    value={areaMax}
                    onChange={(v) => setAreaMax(v)}
                    min={0}
                    style={{ width: '50%' }}
                  />
                </Space.Compact>
              </Col>
              <Col xs={24} sm={12} md={4}>
                <div style={{ marginTop: 18 }}>
                  <Button size="small" onClick={handleResetFilters} disabled={!hasActiveFilters}>
                    Сбросить
                  </Button>
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Фильтр по цене применяется к помещениям на странице объекта. Фильтр по площади — к общей площади объекта.
              </Text>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
        ) : (
          <>
          {filtered.length > 0 && (() => {
            const minArea = Math.min(...filtered.map((p) => p.totalArea));
            const totalUnits = filtered.reduce((sum, p) => sum + (p._count?.units ?? 0), 0);
            return (
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <Text type="secondary">
                  Найдено: <Text strong>{filtered.length} {filtered.length === 1 ? 'объект' : filtered.length < 5 ? 'объекта' : 'объектов'}</Text>
                  {totalUnits > 0 && (<> &middot; <Text strong>{totalUnits} своб. помещений</Text></>)}
                  {' '}&middot; площадь от <Text strong>{formatArea(minArea)}</Text>
                </Text>
              </div>
            );
          })()}
          <Row gutter={[24, 24]}>
            {filtered.map((p) => (
              <Col xs={24} sm={12} lg={8} key={p.id}>
                <Card
                  hoverable
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (priceMin != null) params.set('priceMin', String(priceMin));
                    if (priceMax != null) params.set('priceMax', String(priceMax));
                    const qs = params.toString();
                    navigate(`/catalog/${p.id}${qs ? `?${qs}` : ''}`);
                  }}
                  style={{ height: '100%', overflow: 'hidden' }}
                  cover={
                    p.imageUrl ? (
                      <div style={{ height: 180, overflow: 'hidden', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.style.background = `linear-gradient(135deg, ${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}22, ${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}08)`; (e.target as HTMLImageElement).parentElement!.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;height:100%"><span class="anticon" style="font-size:48px;color:${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}">&#127970;</span></span>`; }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        height: 180,
                        background: `linear-gradient(135deg, ${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}22, ${p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b'}08)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      }}>
                        <BankOutlined style={{ fontSize: 48, color: p.type === 'office' ? '#2563eb' : p.type === 'retail' ? '#7c3aed' : p.type === 'warehouse' ? '#059669' : '#f59e0b' }} />
                      </div>
                    )
                  }
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Tag color={p.type === 'office' ? 'blue' : p.type === 'retail' ? 'purple' : p.type === 'warehouse' ? 'green' : 'orange'}>
                      {PROPERTY_TYPE_MAP[p.type] || p.type}
                    </Tag>
                    {p._count?.units != null && (
                      <Tag color="green">{p._count.units} своб.</Tag>
                    )}
                  </div>
                  <Title level={4} style={{ marginBottom: 4 }}>{p.name}</Title>
                  {p.tenant?.name && (
                    <Space style={{ marginBottom: 4 }}>
                      <BankOutlined style={{ color: '#2563eb' }} />
                      <Text style={{ color: '#2563eb', fontSize: 13 }}>{p.tenant.name}</Text>
                    </Space>
                  )}
                  <br />
                  <Space style={{ marginBottom: 8 }}>
                    <EnvironmentOutlined style={{ color: token.colorTextQuaternary }} />
                    <Text type="secondary">{p.address}</Text>
                  </Space>
                  <br />
                  <Space>
                    <ExpandOutlined style={{ color: token.colorTextQuaternary }} />
                    <Text type="secondary">{formatArea(p.totalArea)}</Text>
                  </Space>
                  {p.floorsCount && (
                    <Text type="secondary" style={{ marginLeft: 16 }}>{p.floorsCount} эт.</Text>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Button type="primary" block>Подробнее</Button>
                  </div>
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
          </>
        )}
      </div>

      {/* Подвал */}
      <div style={{ padding: '24px 48px', textAlign: 'center', borderTop: `1px solid ${token.colorBorderSecondary}`, marginTop: 48 }}>
        <Space split={<Divider type="vertical" />}>
          <Link to="/terms" style={{ color: token.colorTextSecondary, fontSize: 13 }}>Пользовательское соглашение</Link>
          <Link to="/privacy" style={{ color: token.colorTextSecondary, fontSize: 13 }}>Политика конфиденциальности</Link>
        </Space>
        <br />
        <Text type="secondary" style={{ marginTop: 8, display: 'inline-block' }}>
          &copy; {new Date().getFullYear()} NGRent. Все права защищены.
        </Text>
      </div>
    </div>
  );
};

export default CatalogPage;
