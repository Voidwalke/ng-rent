import React, { useState } from 'react';
import { Typography, Table, Tag, Skeleton, Empty, Card, Row, Col, Statistic, Drawer, Descriptions, Divider, Button, theme } from 'antd';
import { DollarOutlined, HomeOutlined, WarningOutlined, EyeOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tenantPortalApi } from '../../api/endpoints';
import api from '../../api/client';
import { formatDate, formatMoney, formatArea } from '../../lib/format';
import { CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { Contract, ContractStatus, Invoice } from '../../types/models';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const TenantRentedUnits: React.FC = () => {
  usePageTitle('Мои помещения');
  const { token } = theme.useToken();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Contract | null>(null);

  const { data: contracts, isLoading: cLoad } = useQuery<Contract[]>({
    queryKey: ['tenant-contracts'],
    queryFn: () => tenantPortalApi.myContracts(),
  });

  const { data: invoices, isLoading: iLoad } = useQuery<Invoice[]>({
    queryKey: ['tenant-invoices'],
    queryFn: () => tenantPortalApi.myInvoices(),
  });

  const activeContracts = (contracts || []).filter((c) => ['signed', 'active'].includes(c.status));
  const allInvoices = invoices || [];
  const overdueInvoices = allInvoices.filter((i) => i.status === 'overdue');
  const totalDebt = allInvoices.filter((i) => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const totalArea = activeContracts.reduce((s, c) => s + Number((c as any).unit?.areaSqm || 0), 0);
  const totalRent = activeContracts.reduce((s, c) => s + Number(c.monthlyRent || 0), 0);

  const getContractInvoices = (c: Contract) => allInvoices.filter((i) => (i as any).contractId === c.id || (i as any).contract?.contractNumber === c.contractNumber);

  const openDetail = (c: Contract) => { setSelected(c); setDrawerOpen(true); };

  const downloadPdf = async (contractId: number, contractNumber: string) => {
    try {
      const response = await api.get(`/contracts/${contractId}/pdf`, { responseType: 'blob', timeout: 120000 });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `contract-${contractNumber}.pdf`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
    } catch { /* ignore */ }
  };

  const columns = [
    {
      title: 'Помещение', key: 'unit',
      render: (_: unknown, r: Contract) => {
        const unit = (r as any).unit;
        const prop = unit?.property?.name || '';
        return (
          <div>
            <Text strong>{prop}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{unit?.unitNumber || '—'} · {unit?.areaSqm ? formatArea(unit.areaSqm) : '—'}{unit?.floor ? ` · ${unit.floor} эт.` : ''}</Text>
          </div>
        );
      },
    },
    { title: 'Аренда/мес', dataIndex: 'monthlyRent', key: 'rent', render: (v: number) => <Text strong>{formatMoney(v)}</Text>, width: 140 },
    {
      title: 'Договор', key: 'contract', width: 160,
      render: (_: unknown, r: Contract) => (
        <div>
          <Link to={`/my/contracts/${r.id}`}>{r.contractNumber}</Link>
          <br /><Text type="secondary" style={{ fontSize: 11 }}>до {formatDate(r.endDate)}</Text>
        </div>
      ),
    },
    {
      title: 'Оплата', key: 'payment', width: 130,
      render: (_: unknown, r: Contract) => {
        const ci = getContractInvoices(r);
        const overdue = ci.filter((i) => i.status === 'overdue');
        const pending = ci.filter((i) => i.status === 'pending');
        if (overdue.length > 0) return <Tag color="red">Просрочено ({overdue.length})</Tag>;
        if (pending.length > 0) return <Tag color="gold">К оплате ({pending.length})</Tag>;
        return <Tag color="green">Оплачено</Tag>;
      },
    },
    {
      title: '', key: 'action', width: 80,
      render: (_: unknown, r: Contract) => <Button size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); openDetail(r); }}>Детали</Button>,
    },
  ];

  if (cLoad || iLoad) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  const selUnit = (selected as any)?.unit;
  const selProp = selUnit?.property;
  const selInvoices = selected ? getContractInvoices(selected) : [];
  const selPaid = selInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const selPending = selInvoices.filter((i) => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + Number(i.totalAmount || 0), 0);

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>Мои помещения</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Помещения по действующим договорам</Text>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={6}><Card size="small"><Statistic title="Помещений" value={activeContracts.length} prefix={<HomeOutlined />} /></Card></Col>
        <Col xs={6}><Card size="small"><Statistic title="Площадь" value={totalArea > 0 ? `${totalArea} м²` : '—'} /></Card></Col>
        <Col xs={6}><Card size="small"><Statistic title="Аренда/мес" value={formatMoney(totalRent)} valueStyle={{ fontSize: 16 }} /></Card></Col>
        <Col xs={6}><Card size="small"><Statistic title="К оплате" value={totalDebt > 0 ? formatMoney(totalDebt) : '0 ₽'} valueStyle={{ color: totalDebt > 0 ? '#ff4d4f' : '#52c41a', fontSize: 16 }} /></Card></Col>
      </Row>

      {overdueInvoices.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 16px', background: token.colorErrorBg, border: `1px solid ${token.colorErrorBorder}`, borderRadius: 6 }}>
          <WarningOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
          <Text type="danger">{overdueInvoices.length} просроченных счетов. <Link to="/my/invoices">Перейти к оплате</Link></Text>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={activeContracts}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: <Empty description="Нет арендованных помещений" /> }}
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => openDetail(r), style: { cursor: 'pointer' } })}
      />

      <Drawer
        title={selProp ? `${selProp.name} — ${selUnit?.unitNumber || ''}` : 'Детали помещения'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelected(null); }}
        width={Math.min(560, window.innerWidth)}
      >
        {selected && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Объект">{selProp?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Адрес">{selProp?.address || '—'}{selProp?.city ? `, ${selProp.city}` : ''}</Descriptions.Item>
              <Descriptions.Item label="Помещение">{selUnit?.unitNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Этаж">{selUnit?.floor ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Площадь">{selUnit?.areaSqm ? formatArea(selUnit.areaSqm) : '—'}</Descriptions.Item>
              {selUnit?.description && <Descriptions.Item label="Описание">{selUnit.description}</Descriptions.Item>}
            </Descriptions>

            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Договор"><Link to={`/my/contracts/${selected.id}`}>{selected.contractNumber}</Link></Descriptions.Item>
              <Descriptions.Item label="Аренда/мес"><Text strong>{formatMoney(selected.monthlyRent)}</Text></Descriptions.Item>
              <Descriptions.Item label="Депозит">{selected.depositAmount ? formatMoney(selected.depositAmount) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Срок">{formatDate(selected.startDate)} — {formatDate(selected.endDate)}</Descriptions.Item>
              <Descriptions.Item label="День оплаты">{selected.paymentDay}-е число</Descriptions.Item>
              <Descriptions.Item label="Статус">
                {(() => { const m = CONTRACT_STATUS_MAP[selected.status as ContractStatus]; return <Tag color={m?.color}>{m?.label || selected.status}</Tag>; })()}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">Финансы</Divider>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col span={12}><Statistic title="Оплачено" value={formatMoney(selPaid)} valueStyle={{ color: '#52c41a', fontSize: 16 }} /></Col>
              <Col span={12}><Statistic title="К оплате" value={formatMoney(selPending)} valueStyle={{ color: selPending > 0 ? '#ff4d4f' : undefined, fontSize: 16 }} /></Col>
            </Row>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<FilePdfOutlined />} onClick={() => downloadPdf(selected.id, selected.contractNumber)}>Договор PDF</Button>
              <Link to="/my/invoices"><Button>Мои счета</Button></Link>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default TenantRentedUnits;
