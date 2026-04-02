import React, { useState, useMemo } from 'react';
import { Typography, Table, Button, Tag, Modal, Form, Input, Select, Skeleton, Empty, Drawer, Descriptions, Timeline, Divider, message } from 'antd';
import { PlusOutlined, EyeOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantPortalApi } from '../../api/endpoints';
import { formatDate, formatDateTime } from '../../lib/format';

const { Title, Text, Paragraph } = Typography;

const priorityMap: Record<string, { label: string; color: string }> = {
  low: { label: 'Низкий', color: 'default' },
  medium: { label: 'Средний', color: 'gold' },
  high: { label: 'Высокий', color: 'red' },
};

const statusMap: Record<string, { label: string; color: string }> = {
  new: { label: 'Новая', color: 'blue' },
  in_progress: { label: 'В работе', color: 'processing' },
  completed: { label: 'Выполнена', color: 'green' },
  cancelled: { label: 'Отменена', color: 'default' },
};

/** Parse notes from the description field. Notes are appended in the format:
 *  \n---\n[YYYY-MM-DD HH:mm] Note text
 */
interface NoteEntry {
  timestamp: string;
  text: string;
}

function parseNotes(description?: string): { baseDescription: string; notes: NoteEntry[] } {
  if (!description) return { baseDescription: '', notes: [] };
  const separator = '\n---\n';
  const sepIndex = description.indexOf(separator);
  if (sepIndex === -1) return { baseDescription: description, notes: [] };

  const baseDescription = description.slice(0, sepIndex);
  const notesPart = description.slice(sepIndex + separator.length);
  const noteLines = notesPart.split('\n').filter((l) => l.trim());
  const notes: NoteEntry[] = [];
  const noteRegex = /^\[(.+?)\]\s*(.+)$/;

  for (const line of noteLines) {
    const match = line.match(noteRegex);
    if (match) {
      notes.push({ timestamp: match[1], text: match[2] });
    } else if (line.trim()) {
      notes.push({ timestamp: '', text: line.trim() });
    }
  }

  return { baseDescription, notes };
}

const TenantMaintenance: React.FC = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Состояние панели деталей
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['tenant-maintenance'],
    queryFn: () => tenantPortalApi.myMaintenance(),
  });

  const createMutation = useMutation({
    mutationFn: (dto: any) => tenantPortalApi.createMaintenance(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-maintenance'] });
      setModalOpen(false);
      form.resetFields();
      message.success('Заявка на обслуживание создана');
    },
    onError: () => message.error('Ошибка создания заявки'),
  });

  const openDrawer = (r: any) => {
    setSelectedRequest(r);
    setDrawerOpen(true);
  };

  const { baseDescription, notes } = useMemo(() => {
    return parseNotes(selectedRequest?.description);
  }, [selectedRequest]);

  const columns = [
    { title: '№', dataIndex: 'id', key: 'id', render: (v: number) => `#${v}` },
    { title: 'Тема', dataIndex: 'title', key: 'title' },
    { title: 'Помещение', key: 'unit', render: (_: any, r: any) => r.unit?.unitNumber || '—' },
    {
      title: 'Приоритет', dataIndex: 'priority', key: 'priority',
      render: (p: string) => { const m = priorityMap[p]; return <Tag color={m?.color || 'default'}>{m?.label || p}</Tag>; },
    },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: string) => { const m = statusMap[s]; return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>; },
    },
    { title: 'Создана', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    {
      title: '', key: 'actions',
      render: (_: unknown, r: any) => (
        <Button icon={<EyeOutlined />} size="small" onClick={() => openDrawer(r)} />
      ),
    },
  ];

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Заявки на обслуживание</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
          Создать заявку
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data || []}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description="Нет заявок на обслуживание" /> }}
        onRow={(record) => ({
          onClick: () => openDrawer(record),
          style: { cursor: 'pointer' },
        })}
      />

      {/* Панель деталей */}
      <Drawer
        title={selectedRequest ? `Заявка #${selectedRequest.id}: ${selectedRequest.title}` : 'Детали заявки'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedRequest(null); }}
        width={window.innerWidth < 540 ? '100%' : 520}
      >
        {selectedRequest && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Тема">{selectedRequest.title}</Descriptions.Item>
              <Descriptions.Item label="Помещение">{selectedRequest.unit?.unitNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Приоритет">
                <Tag color={priorityMap[selectedRequest.priority]?.color || 'default'}>
                  {priorityMap[selectedRequest.priority]?.label || selectedRequest.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={statusMap[selectedRequest.status]?.color || 'default'}>
                  {statusMap[selectedRequest.status]?.label || selectedRequest.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Создана">{formatDateTime(selectedRequest.createdAt)}</Descriptions.Item>
              {selectedRequest.updatedAt && (
                <Descriptions.Item label="Обновлена">{formatDateTime(selectedRequest.updatedAt)}</Descriptions.Item>
              )}
            </Descriptions>

            {baseDescription && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>Описание</Text>
                <Paragraph style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{baseDescription}</Paragraph>
              </div>
            )}

            <Divider orientation="left">Заметки от администратора</Divider>

            {notes.length > 0 ? (
              <Timeline
                items={notes.map((n, i) => ({
                  key: i,
                  dot: <ClockCircleOutlined style={{ fontSize: 14 }} />,
                  children: (
                    <div>
                      {n.timestamp && (
                        <Text type="secondary" style={{ fontSize: 12 }}>{n.timestamp}</Text>
                      )}
                      <div>{n.text}</div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Text type="secondary">Заметок пока нет</Text>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title="Новая заявка на обслуживание"
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => createMutation.mutate(v))}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createMutation.isPending}
        okText="Создать"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Тема" rules={[{ required: true, message: 'Укажите тему' }]}>
            <Input placeholder="Не работает кондиционер" />
          </Form.Item>
          <Form.Item name="description" label="Описание" rules={[{ required: true, message: 'Опишите проблему' }]}>
            <Input.TextArea rows={4} placeholder="Подробное описание проблемы..." />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" initialValue="medium">
            <Select options={[
              { value: 'low', label: 'Низкий — не срочно' },
              { value: 'medium', label: 'Средний — в ближайшее время' },
              { value: 'high', label: 'Высокий — срочно' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TenantMaintenance;
