import React, { useState } from 'react';
import { Typography, Table, Tag, Skeleton, Empty, Button, Modal, Alert, message, theme, Row, Col, Card, Statistic } from 'antd';
import { QrcodeOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tenantPortalApi } from '../../api/endpoints';
import { formatDate } from '../../lib/format';
import type { AccessCard, AccessCardQrData } from '../../types/models';

const { Title, Text } = Typography;

const TenantAccessCards: React.FC = () => {
  const { token } = theme.useToken();
  const { data, isLoading } = useQuery<AccessCard[]>({
    queryKey: ['tenant-access-cards'],
    queryFn: () => tenantPortalApi.myAccessCards(),
  });

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<AccessCardQrData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const handleShowQr = async (cardId: number) => {
    setQrLoading(true);
    try {
      const result = await tenantPortalApi.getCardQr(cardId);
      setQrData(result);
      setQrModalOpen(true);
    } catch {
      message.error('Не удалось получить QR-код');
    } finally {
      setQrLoading(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrData) return;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData.qrToken)}`;
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `qr-card-${qrData.cardNumber}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
    { title: '№ карты', dataIndex: 'cardNumber', key: 'num' },
    { title: 'Владелец', dataIndex: 'holderName', key: 'holder', render: (v: string) => v || '\u2014' },
    { title: 'Договор', dataIndex: ['contract', 'contractNumber'], key: 'contract' },
    { title: 'Зоны', dataIndex: 'zones', key: 'zones', render: (v: string[]) => (v || []).join(', ') || '\u2014' },
    {
      title: 'Статус', dataIndex: 'isActive', key: 'status',
      render: (v: boolean, r: AccessCard) => v
        ? <Tag color="green">Активна</Tag>
        : <Tag color="red">{r.blockedReason || 'Заблокирована'}</Tag>,
    },
    { title: 'Срок до', dataIndex: 'expiresAt', key: 'expires', render: (d: string) => d ? formatDate(d) : '\u2014' },
    {
      title: 'QR', key: 'qr',
      render: (_: unknown, record: AccessCard) =>
        record.isActive ? (
          <Button
            icon={<QrcodeOutlined />}
            size="small"
            loading={qrLoading}
            onClick={() => handleShowQr(record.id)}
          >
            QR
          </Button>
        ) : null,
    },
  ];

  const cards = data || [];
  const activeCards = cards.filter((c) => c.isActive).length;

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Мои пропуска (СКУД)</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12}><Card size="small"><Statistic title="Всего карт" value={cards.length} /></Card></Col>
        <Col xs={12}><Card size="small"><Statistic title="Активных" value={activeCards} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data || []}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: <Empty description="У вас пока нет карт доступа" /> }}
      />

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="Если карта заблокирована — обратитесь в управляющую компанию через раздел «Поддержка» для восстановления доступа"
      />

      <Modal
        title="QR-код карты доступа"
        open={qrModalOpen}
        onCancel={() => { setQrModalOpen(false); setQrData(null); }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={handleDownloadQr}>
            Скачать QR
          </Button>,
          <Button key="close" type="primary" onClick={() => { setQrModalOpen(false); setQrData(null); }}>
            Закрыть
          </Button>,
        ]}
        centered
      >
        {qrData && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData.qrToken)}`}
              alt="QR-код карты доступа"
              style={{ width: 300, height: 300, marginBottom: 16 }}
            />
            <div style={{ marginBottom: 8 }}>
              <Text strong>Карта: </Text>
              <Text>{qrData.cardNumber}</Text>
            </div>
            {qrData.holderName && (
              <div style={{ marginBottom: 8 }}>
                <Text strong>Владелец: </Text>
                <Text>{qrData.holderName}</Text>
              </div>
            )}
            <div style={{ marginTop: 16, padding: '8px 16px', background: token.colorSuccessBg, borderRadius: 6, border: `1px solid ${token.colorSuccessBorder}` }}>
              <Text type="secondary">Покажите этот QR-код на входе в здание</Text>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TenantAccessCards;
