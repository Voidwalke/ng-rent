import React, { useMemo } from 'react';
import { Typography, Table, Button, Select, Tag, Space, message, Row, Col, Card, Statistic } from 'antd';
import { EyeOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { contractsApi } from '../../api/endpoints';
import { formatDate, formatMoney } from '../../lib/format';
import { CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { Contract, ContractStatus } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import { exportTableToCsv } from '../../lib/export';

const { Title, Text } = Typography;

const statusOptions = Object.entries(CONTRACT_STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }));

const ContractsPage: React.FC = () => {
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

  const { data, isLoading } = useQuery<PaginatedResponse<Contract>>({
    queryKey: ['contracts', page, statusFilter],
    queryFn: () => contractsApi.list({ page, limit: 20, status: statusFilter }),
  });

  const filteredData = React.useMemo(() => {
    let items = data?.data || [];
    if (statusFilter) items = items.filter((c) => c.status === statusFilter);
    return items;
  }, [data, statusFilter]);

  const stats = useMemo(() => {
    const all = data?.data || [];
    return {
      total: data?.total ?? 0,
      active: all.filter((c: any) => ['active', 'signed'].includes(c.status)).length,
      expiringSoon: all.filter((c: any) => ['active', 'signed'].includes(c.status) && c.endDate && (new Date(c.endDate).getTime() - Date.now()) / 86400000 <= 30).length,
      terminated: all.filter((c: any) => c.status === 'terminated').length,
    };
  }, [data]);

  const handleDownload = async (contract: Contract) => {
    try {
      const blob = await contractsApi.downloadPdf(contract.id);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.contractNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Ошибка скачивания');
    }
  };

  const columns = [
    { title: '№', dataIndex: 'contractNumber', key: 'num', render: (n: string, r: Contract) => <Link to={`/contracts/${r.id}`}>{n}</Link> },
    { title: 'Клиент', dataIndex: ['client', 'companyName'], key: 'client' },
    { title: 'Помещение', key: 'unit', render: (_: unknown, r: Contract) => r.unit?.unitNumber || '—' },
    { title: 'Аренда/мес', dataIndex: 'monthlyRent', key: 'rent', render: (v: number) => formatMoney(v) },
    { title: 'Начало', dataIndex: 'startDate', key: 'start', render: (d: string) => formatDate(d) },
    { title: 'Окончание', dataIndex: 'endDate', key: 'end', render: (d: string) => formatDate(d) },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: ContractStatus) => {
        const m = CONTRACT_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    {
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: Contract) => (
        <Space>
          <Link to={`/contracts/${r.id}`}><Button icon={<EyeOutlined />} size="small" /></Link>
          <Button icon={<DownloadOutlined />} size="small" onClick={() => handleDownload(r)} />
        </Space>
      ),
    },
  ];

  const exportCsvColumns = [
    { title: '№', dataIndex: 'contractNumber' },
    { title: 'Клиент', dataIndex: ['client', 'companyName'] },
    { title: 'Помещение', dataIndex: ['unit', 'unitNumber'] },
    { title: 'Аренда/мес', dataIndex: 'monthlyRent' },
    { title: 'Начало', dataIndex: 'startDate' },
    { title: 'Окончание', dataIndex: 'endDate' },
    { title: 'Статус', dataIndex: 'status' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Договоры</Title>
        <Button icon={<ExportOutlined />} onClick={() => exportTableToCsv(exportCsvColumns, filteredData as Record<string, unknown>[], 'contracts')}>Экспорт</Button>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Всего" value={stats.total} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Активных" value={stats.active} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Истекают за 30 дн." value={stats.expiringSoon} valueStyle={{ color: stats.expiringSoon > 0 ? '#faad14' : undefined }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Расторгнуто" value={stats.terminated} /></Card></Col>
      </Row>
      <Select placeholder="Статус" allowClear options={statusOptions} value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 200, marginBottom: 16 }} />
      <Table columns={columns} dataSource={filteredData} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <div style={{ padding: 32 }}><Text type="secondary">Договоры создаются из одобренных заявок.</Text><br /><Link to="/applications"><Button type="link" style={{ padding: 0 }}>Перейти к заявкам →</Button></Link></div> }} />
    </div>
  );
};

export default ContractsPage;
