import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Typography, Table, Skeleton, Button, Statistic, Empty, DatePicker, Space, message } from 'antd';
import { DownloadOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { dashboardApi } from '../../api/endpoints';
import api from '../../api/client';
import { formatMoney } from '../../lib/format';
import type { RevenuePoint, CashflowPoint, OccupancyPoint, AgedDebt } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const COLORS = ['#2563eb', '#7c3aed', '#f59e0b', '#ef4444', '#10b981'];

const EmptyChart: React.FC<{ text?: string }> = ({ text }) => (
  <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Empty description={text || 'Нет данных для отображения'} />
  </div>
);

const AnalyticsPage: React.FC = () => {
  usePageTitle('Аналитика');
  const defaultEnd = dayjs();
  const defaultStart = dayjs().subtract(12, 'month');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([defaultStart, defaultEnd]);

  /** Calculate months between start and end dates */
  const months = useMemo(() => {
    const [start, end] = dateRange;
    const diff = end.diff(start, 'month');
    return Math.max(1, diff);
  }, [dateRange]);

  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  const { data: revenue, isLoading: revLoading } = useQuery<RevenuePoint[]>({
    queryKey: ['analytics-revenue', months],
    queryFn: () => dashboardApi.revenue(months),
  });

  const { data: cashflow, isLoading: cfLoading } = useQuery<CashflowPoint[]>({
    queryKey: ['analytics-cashflow', months],
    queryFn: () => dashboardApi.cashflow(months),
  });

  const { data: occupancy, isLoading: occLoading } = useQuery<OccupancyPoint[]>({
    queryKey: ['analytics-occupancy'],
    queryFn: () => dashboardApi.occupancy(),
  });

  const { data: agedDebt, isLoading: debtLoading } = useQuery<AgedDebt[]>({
    queryKey: ['analytics-aged-debt'],
    queryFn: () => dashboardApi.agedDebt(),
  });

  const { data: vacancyCostRaw } = useQuery<Record<string, unknown>>({
    queryKey: ['analytics-vacancy-cost'],
    queryFn: () => dashboardApi.vacancyCost() as Promise<Record<string, unknown>>,
  });

  const { data: topDebtors } = useQuery<any[]>({
    queryKey: ['analytics-top-debtors'],
    queryFn: () => dashboardApi.topDebtors(),
  });

  const { data: avgPayDays } = useQuery<{ avgDays: number; count: number }>({
    queryKey: ['analytics-avg-pay-days', months],
    queryFn: () => dashboardApi.avgPaymentDays(months),
  });

  const { data: revByProp } = useQuery<any[]>({
    queryKey: ['analytics-rev-by-property', months],
    queryFn: () => dashboardApi.revenueByProperty(months),
  });

  const { data: forecast } = useQuery<any[]>({
    queryKey: ['analytics-forecast'],
    queryFn: () => dashboardApi.forecast(6),
  });
  // Бэкенд возвращает { vacantUnits: [...], totalVacantUnits: number, totalMonthlyLoss: number }
  const vacancyCost = vacancyCostRaw ? {
    totalMonthlyCost: (vacancyCostRaw.totalMonthlyLoss as number) ?? 0,
    vacantUnits: (vacancyCostRaw.totalVacantUnits as number) ?? (Array.isArray(vacancyCostRaw.vacantUnits) ? vacancyCostRaw.vacantUnits.length : 0),
    avgDaysVacant: (vacancyCostRaw.avgDaysVacant as number) ?? 0,
  } : null;

  const handleExport = async () => {
    try {
      const response = await api.get('/analytics/export', { responseType: 'blob', params: { format: 'json' } });
      const blob = new Blob([response.data], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.URL.revokeObjectURL(link.href);
      message.success('Экспорт загружен');
    } catch { message.error('Ошибка экспорта'); }
  };

  const loading = revLoading || cfLoading || occLoading || debtLoading;

  const ChartSkeleton: React.FC = () => (
    <div style={{ padding: 16 }}>
      <Skeleton.Input active block style={{ height: 20, marginBottom: 16 }} />
      <Skeleton.Input active block style={{ height: 260 }} />
    </div>
  );

  if (loading) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <Skeleton.Input active style={{ width: 180, height: 32 }} />
          <Skeleton.Input active style={{ width: 320, height: 32 }} />
        </div>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[1, 2, 3].map((i) => (
            <Col xs={8} key={i}>
              <Card><Skeleton active paragraph={{ rows: 1 }} title={{ width: '60%' }} /></Card>
            </Col>
          ))}
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}><Card><ChartSkeleton /></Card></Col>
          <Col xs={24} lg={12}><Card><ChartSkeleton /></Card></Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}><Card><ChartSkeleton /></Card></Col>
          <Col xs={24} lg={12}><Card><ChartSkeleton /></Card></Col>
        </Row>
      </div>
    );
  }

  const hasRevenue = revenue && revenue.length > 0;
  const hasCashflow = cashflow && cashflow.length > 0;
  const hasOccupancy = occupancy && occupancy.length > 0;
  const hasDebt = agedDebt && agedDebt.length > 0 && agedDebt.some((d) => Number(d.amount) > 0);

  const debtColumns = [
    { title: 'Период', dataIndex: 'range', key: 'range' },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', render: (v: number) => formatMoney(v) },
    { title: 'Кол-во счетов', dataIndex: 'count', key: 'count' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>Аналитика</Title>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={handleRangeChange}
            picker="month"
            format="MMM YYYY"
            allowClear={false}
            suffixIcon={<CalendarOutlined />}
            style={{ minWidth: 260 }}
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport}>Экспорт данных</Button>
        </Space>
      </div>

      {/* Стоимость простоя */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card><Statistic title="Стоимость простоя/мес" value={vacancyCost ? formatMoney(vacancyCost.totalMonthlyCost) : '—'} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={8}>
          <Card><Statistic title="Пустующих помещений" value={vacancyCost?.vacantUnits ?? '—'} /></Card>
        </Col>
        <Col xs={8}>
          <Card><Statistic title="Среднее время простоя" value={vacancyCost?.avgDaysVacant ?? '—'} suffix="дн." /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={`Доход (${months} мес.)`}>
            {hasRevenue ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="Доход" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Нет данных о доходах. Графики появятся после оплаты счетов." />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Движение денежных средств">
            {hasCashflow ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cashflow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Legend />
                  <Bar dataKey="billed" name="Начислено" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Собрано" fill="#52c41a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Нет данных о движении средств" />}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Заполняемость по объектам">
            {hasOccupancy ? (
              <ResponsiveContainer width="100%" height={Math.max(200, occupancy!.length * 50)}>
                <BarChart data={occupancy} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis dataKey="propertyName" type="category" width={160} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="occupancyRate" name="Заполняемость" fill="#2563eb" barSize={24} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Нет объектов для отображения заполняемости" />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Просроченная задолженность">
            {hasDebt ? (
              <div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={agedDebt} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => formatMoney(v)} />
                    <YAxis dataKey="range" type="category" width={60} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Bar dataKey="amount" name="Сумма" barSize={20} radius={[0, 4, 4, 0]}>
                      {(agedDebt || []).map((_, i) => (
                        <Cell key={i} fill={['#faad14', '#ff7a45', '#ff4d4f', '#cf1322'][i] || '#ff4d4f'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <Table
                  columns={debtColumns}
                  dataSource={agedDebt || []}
                  rowKey="range"
                  pagination={false}
                  size="small"
                  style={{ marginTop: 12 }}
                />
              </div>
            ) : (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text type="success" strong>Просроченная задолженность отсутствует</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Средний срок оплаты + Итого прогноз */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12}>
          <Card><Statistic title="Средний срок оплаты" value={avgPayDays?.avgDays ?? '—'} suffix="дн." valueStyle={{ color: (avgPayDays?.avgDays ?? 0) > 14 ? '#ff4d4f' : '#52c41a' }} /></Card>
        </Col>
        <Col xs={12}>
          <Card><Statistic title="Прогноз дохода (6 мес.)" value={forecast ? formatMoney(forecast.reduce((s: number, f: any) => s + f.forecast, 0)) : '—'} valueStyle={{ color: '#2563eb' }} /></Card>
        </Col>
      </Row>

      {/* Прогноз дохода + Доход по объектам */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Прогноз дохода">
            {forecast && forecast.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecast}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Area type="monotone" dataKey="forecast" name="Прогноз" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Нет активных договоров для прогноза" />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Доход по объектам">
            {revByProp && revByProp.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revByProp} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Bar dataKey="revenue" name="Доход" fill="#10b981" barSize={24} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Нет данных о доходах по объектам" />}
          </Card>
        </Col>
      </Row>

      {/* Таблица должников */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="Топ-5 должников">
            {topDebtors && topDebtors.length > 0 ? (
              <Table
                dataSource={topDebtors}
                rowKey="clientId"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Контрагент', dataIndex: 'companyName', key: 'name' },
                  { title: 'ИНН', dataIndex: 'inn', key: 'inn', render: (v: string) => v || '—' },
                  { title: 'Задолженность', dataIndex: 'total', key: 'total', render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{formatMoney(v)}</span> },
                ]}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Text type="success" strong>Должников нет</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AnalyticsPage;
