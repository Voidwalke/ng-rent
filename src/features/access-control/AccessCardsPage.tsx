import React, { useState } from 'react';
import { Typography, Table, Button, Tag, Space, Modal, Form, Input, Select, Popconfirm, message, Empty, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, StopOutlined, CheckOutlined, DeleteOutlined, QrcodeOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accessCardsApi, clientsApi, contractsApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatDate } from '../../lib/format';
import type { AccessCard, AccessCardQrData, Client, Contract } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateAccessCardDto } from '../../types/dto';

const { Title, Text } = Typography;

const AccessCardsPage: React.FC = () => {
  const { hasRole } = useAuthStore();
  const canManage = hasRole('admin', 'manager');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<AccessCardQrData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery<PaginatedResponse<AccessCard>>({
    queryKey: ['access-cards', page],
    queryFn: () => accessCardsApi.list({ page, limit: 20 }),
  });

  const { data: clients } = useQuery<PaginatedResponse<Client>>({
    queryKey: ['clients-select'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  const { data: contracts } = useQuery<PaginatedResponse<Contract>>({
    queryKey: ['contracts-select-active'],
    queryFn: () => contractsApi.list({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateAccessCardDto) => accessCardsApi.create(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['access-cards'] }); setModalOpen(false); form.resetFields(); message.success('Карта выдана'); },
    onError: () => message.error('Ошибка выдачи карты'),
  });

  const blockMutation = useMutation({
    mutationFn: (id: number) => accessCardsApi.block(id, 'Заблокирована вручную'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['access-cards'] }); message.success('Карта заблокирована'); },
    onError: () => message.error('Ошибка'),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: number) => accessCardsApi.unblock(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['access-cards'] }); message.success('Карта разблокирована'); },
    onError: () => message.error('Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accessCardsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['access-cards'] }); message.success('Карта удалена'); },
    onError: () => message.error('Ошибка'),
  });

  const handleShowQr = async (cardId: number) => {
    setQrLoading(true);
    try {
      const result = await accessCardsApi.getQr(cardId);
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
    { title: 'Номер карты', dataIndex: 'cardNumber', key: 'num' },
    { title: 'Владелец', dataIndex: 'holderName', key: 'holder' },
    { title: 'Клиент', dataIndex: ['client', 'companyName'], key: 'client' },
    { title: 'Договор', dataIndex: ['contract', 'contractNumber'], key: 'contract', render: (v: string) => v || '\u2014' },
    { title: 'Зоны', dataIndex: 'zones', key: 'zones', render: (z: string[]) => (z || []).map((zone) => <Tag key={zone}>{zone}</Tag>) },
    {
      title: 'Статус', dataIndex: 'isActive', key: 'status',
      render: (v: boolean, r: AccessCard) => v
        ? <Tag color="green">Активна</Tag>
        : <Tag color="red">Заблокирована{r.blockedReason ? `: ${r.blockedReason}` : ''}</Tag>,
    },
    { title: 'Выдана', dataIndex: 'activatedAt', key: 'activated', render: (d: string) => d ? formatDate(d) : '\u2014' },
    {
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: AccessCard) => (
        <Space>
          {r.isActive && (
            <Button
              icon={<QrcodeOutlined />}
              size="small"
              loading={qrLoading}
              onClick={() => handleShowQr(r.id)}
            >
              QR
            </Button>
          )}
          {r.isActive ? (
            <Button icon={<StopOutlined />} size="small" danger onClick={() => blockMutation.mutate(r.id)}>Блокировать</Button>
          ) : (
            <Button icon={<CheckOutlined />} size="small" onClick={() => unblockMutation.mutate(r.id)}>Разблокировать</Button>
          )}
          <Popconfirm title="Удалить карту?" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const zoneOptions = ['\u0412\u0445\u043e\u0434', '\u041f\u0430\u0440\u043a\u043e\u0432\u043a\u0430', '\u041e\u0444\u0438\u0441\u044b', '\u0421\u043a\u043b\u0430\u0434', '\u041e\u0431\u0449\u0438\u0435 \u0437\u043e\u043d\u044b'].map((z) => ({ value: z, label: z }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Карты доступа (СКУД)</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Выдать карту</Button>
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small"><Statistic title="Всего карт" value={data?.total ?? 0} /></Card>
        </Col>
        <Col xs={8}>
          <Card size="small"><Statistic title="Активных" value={(data?.data || []).filter((c) => c.isActive === true).length} /></Card>
        </Col>
        <Col xs={8}>
          <Card size="small"><Statistic title="Заблокированных" value={(data?.data || []).filter((c) => c.isActive === false).length} /></Card>
        </Col>
      </Row>

      {selectedIds.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 16px', background: '#e6f4ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text>Выбрано: {selectedIds.length}</Text>
          <Button size="small" danger icon={<StopOutlined />} onClick={async () => {
            const active = (data?.data || []).filter((c) => selectedIds.includes(c.id) && c.isActive);
            await Promise.allSettled(active.map((c) => accessCardsApi.block(c.id, 'Массовая блокировка')));
            queryClient.invalidateQueries({ queryKey: ['access-cards'] });
            setSelectedIds([]);
            message.success(`Заблокировано: ${active.length}`);
          }}>Заблокировать</Button>
          <Button size="small" icon={<CheckOutlined />} onClick={async () => {
            const blocked = (data?.data || []).filter((c) => selectedIds.includes(c.id) && !c.isActive);
            await Promise.allSettled(blocked.map((c) => accessCardsApi.unblock(c.id)));
            queryClient.invalidateQueries({ queryKey: ['access-cards'] });
            setSelectedIds([]);
            message.success(`Разблокировано: ${blocked.length}`);
          }}>Разблокировать</Button>
          <Button size="small" type="link" onClick={() => setSelectedIds([])}>Сбросить</Button>
        </div>
      )}
      <Table columns={columns} dataSource={data?.data || []} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Карты доступа не выданы" /> }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} />

      <Modal title="Выдать карту доступа" open={modalOpen} onOk={() => form.validateFields().then((v) => createMutation.mutate(v as CreateAccessCardDto))} onCancel={() => setModalOpen(false)} confirmLoading={createMutation.isPending} okText="Выдать" cancelText="Отмена" width="min(520px, 90vw)">
        <Form form={form} layout="vertical">
          <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
            <Select showSearch optionFilterProp="label" options={(clients?.data || []).map((c: Client) => ({ value: c.id, label: c.companyName }))} />
          </Form.Item>
          <Form.Item name="contractId" label="Договор" rules={[{ required: true, message: 'Выберите договор' }]}>
            <Select options={(contracts?.data || []).map((c: Contract) => ({ value: c.id, label: c.contractNumber }))} />
          </Form.Item>
          <Form.Item name="cardNumber" label="Номер карты" rules={[{ required: true, message: 'Введите номер' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="holderName" label="Имя владельца" rules={[{ required: true, message: 'Введите имя' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="zones" label="Зоны доступа">
            <Select mode="multiple" options={zoneOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="QR-код карты доступа"
        open={qrModalOpen}
        onCancel={() => { setQrModalOpen(false); setQrData(null); }}
        width="min(480px, 90vw)"
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
            <div style={{ marginTop: 16, padding: '8px 16px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
              <Text type="secondary">Покажите этот QR-код на входе в здание</Text>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AccessCardsPage;
