import React, { useState } from 'react';
import { Typography, Table, Button, Card, Skeleton, Tag, Space, Empty, message, Input } from 'antd';
import { DownloadOutlined, FileTextOutlined, DollarOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tenantPortalApi, contractsApi, invoicesApi } from '../../api/endpoints';
import { formatDate, formatMoney } from '../../lib/format';
import { INVOICE_STATUS_MAP } from '../../lib/constants';
import type { Contract, Invoice, InvoiceStatus } from '../../types/models';

const { Title, Text } = Typography;

const TenantDocuments: React.FC = () => {
  const [search, setSearch] = useState('');

  const { data: contracts, isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ['tenant-contracts'],
    queryFn: () => tenantPortalApi.myContracts(),
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['tenant-invoices-docs'],
    queryFn: () => tenantPortalApi.myInvoices() as Promise<Invoice[]>,
  });

  const handleDownloadContract = async (contract: Contract) => {
    try {
      const blob = await contractsApi.downloadPdf(contract.id);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.contractNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Ошибка скачивания договора');
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      const blob = await invoicesApi.downloadDocument(invoice.id);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoice.invoiceNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Ошибка скачивания счёта');
    }
  };

  const isLoading = contractsLoading || invoicesLoading;

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  const contractColumns = [
    {
      title: 'Документ',
      key: 'doc',
      render: (_: unknown, contract: Contract) => (
        <Space>
          <FileTextOutlined style={{ fontSize: 18, color: '#2563eb' }} />
          <span>Договор {contract.contractNumber}</span>
        </Space>
      ),
    },
    {
      title: 'Период',
      key: 'period',
      render: (_: unknown, contract: Contract) => `${formatDate(contract.startDate)} — ${formatDate(contract.endDate)}`,
    },
    {
      title: 'Аренда/мес',
      dataIndex: 'monthlyRent',
      key: 'rent',
      render: (v: number) => formatMoney(v),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, contract: Contract) => (
        <Button icon={<DownloadOutlined />} size="small" onClick={() => handleDownloadContract(contract)}>
          PDF
        </Button>
      ),
    },
  ];

  const invoiceColumns = [
    {
      title: 'Документ',
      key: 'doc',
      render: (_: unknown, invoice: Invoice) => (
        <Space>
          <DollarOutlined style={{ fontSize: 18, color: '#52c41a' }} />
          <span>Счёт {invoice.invoiceNumber}</span>
        </Space>
      ),
    },
    {
      title: 'Период',
      key: 'period',
      render: (_: unknown, invoice: Invoice) =>
        invoice.periodStart && invoice.periodEnd
          ? `${formatDate(invoice.periodStart)} — ${formatDate(invoice.periodEnd)}`
          : formatDate(invoice.dueDate),
    },
    {
      title: 'Сумма',
      dataIndex: 'totalAmount',
      key: 'amount',
      render: (v: number) => formatMoney(v),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (s: InvoiceStatus) => {
        const m = INVOICE_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, invoice: Invoice) => (
        <Button icon={<DownloadOutlined />} size="small" onClick={() => handleDownloadInvoice(invoice)}>
          Скачать
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>Мои документы</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>Здесь хранятся договоры и счета, связанные с вашей арендой</Text>

      <Input prefix={<SearchOutlined />} placeholder="Поиск по номеру документа..." value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ width: 360, marginBottom: 16 }} />

      <Card
        title={<Space><FileTextOutlined />Договоры</Space>}
        style={{ marginBottom: 24 }}
      >
        <Table
          columns={contractColumns}
          dataSource={(contracts || []).filter(c => !search || c.contractNumber?.toLowerCase().includes(search.toLowerCase()))}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Документов пока нет" /> }}
        />
      </Card>

      <Card
        title={<Space><DollarOutlined />Счета</Space>}
      >
        <Table
          columns={invoiceColumns}
          dataSource={(invoices || []).filter(inv => !search || inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()))}
          rowKey="id"
          pagination={invoices && invoices.length > 10 ? { pageSize: 10 } : false}
          size="small"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Документов пока нет" /> }}
        />
      </Card>
    </div>
  );
};

export default TenantDocuments;
