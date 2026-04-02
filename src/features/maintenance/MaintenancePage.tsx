import React, { useState, useMemo, useCallback } from 'react';
import { Typography, Table, Button, Tag, Space, Modal, Form, Input, Select, Drawer, Descriptions, Timeline, Divider, Empty, message, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, SendOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi, unitsApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { formatDate, formatDateTime } from '../../lib/format';
import { TICKET_PRIORITY_MAP, MAINTENANCE_STATUS_MAP } from '../../lib/constants';
import type { MaintenanceRequest, MaintenanceStatus, Unit } from '../../types/models';
import type { TicketPriority } from '../../types/models';
import type { PaginatedResponse } from '../../types/api';
import type { CreateMaintenanceDto, UpdateMaintenanceDto } from '../../types/dto';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const priorityOptions = Object.entries(TICKET_PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v.label }));
const statusOptions = Object.entries(MAINTENANCE_STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }));

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

function appendNote(currentDescription: string | undefined, noteText: string): string {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const noteEntry = `[${ts}] ${noteText}`;
  const base = currentDescription || '';

  if (base.includes('\n---\n')) {
    return `${base}\n${noteEntry}`;
  }
  return `${base}\n---\n${noteEntry}`;
}

const MaintenancePage: React.FC = () => {
  usePageTitle('Обслуживание');
  const { hasRole } = useAuthStore();
  const canManage = hasRole('admin', 'manager');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRequest | null>(null);
  const [form] = Form.useForm();

  // Состояние панели деталей
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [noteText, setNoteText] = useState('');

  const { data, isLoading } = useQuery<PaginatedResponse<MaintenanceRequest>>({
    queryKey: ['maintenance', page],
    queryFn: () => maintenanceApi.list({ page, limit: 20 }),
  });

  const { data: units } = useQuery<PaginatedResponse<Unit>>({
    queryKey: ['units-select'],
    queryFn: () => unitsApi.list({ limit: 200 }),
  });

  // Загрузка полных данных выбранной заявки (для получения актуального описания с заметками)
  const { data: detailData } = useQuery<MaintenanceRequest>({
    queryKey: ['maintenance-detail', selectedRequest?.id],
    queryFn: () => maintenanceApi.get(selectedRequest!.id),
    enabled: !!selectedRequest && drawerOpen,
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateMaintenanceDto) => maintenanceApi.create(dto),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['maintenance'] }); setModalOpen(false); form.resetFields(); message.success('Заявка создана'); },
    onError: () => message.error('Ошибка'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...values }: UpdateMaintenanceDto & { id: number }) => maintenanceApi.update(id, values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['maintenance'] }); setModalOpen(false); setEditing(null); form.resetFields(); message.success('Заявка обновлена'); },
    onError: () => message.error('Ошибка'),
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ id, description }: { id: number; description: string }) =>
      maintenanceApi.update(id, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-detail', selectedRequest?.id] });
      setNoteText('');
      message.success('Заметка добавлена');
    },
    onError: () => message.error('Ошибка при добавлении заметки'),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (r: MaintenanceRequest) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };
  const openDrawer = (r: MaintenanceRequest) => { setSelectedRequest(r); setDrawerOpen(true); };
  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editing) updateMutation.mutate({ id: editing.id, ...values });
      else createMutation.mutate(values as CreateMaintenanceDto);
    });
  };

  const handleAddNote = useCallback(() => {
    if (!noteText.trim() || !selectedRequest) return;
    const currentDesc = detailData?.description ?? selectedRequest.description;
    const newDescription = appendNote(currentDesc, noteText.trim());
    addNoteMutation.mutate({ id: selectedRequest.id, description: newDescription });
  }, [noteText, selectedRequest, detailData, addNoteMutation]);

  const { baseDescription, notes } = useMemo(() => {
    const desc = detailData?.description ?? selectedRequest?.description;
    return parseNotes(desc);
  }, [detailData, selectedRequest]);

  const columns = [
    { title: '№', dataIndex: 'id', key: 'id' },
    { title: 'Заголовок', dataIndex: 'title', key: 'title' },
    { title: 'Помещение', dataIndex: ['unit', 'unitNumber'], key: 'unit' },
    {
      title: 'Приоритет', dataIndex: 'priority', key: 'priority',
      render: (p: TicketPriority) => {
        const m = TICKET_PRIORITY_MAP[p];
        return <Tag color={m?.color || 'default'}>{m?.label || p}</Tag>;
      },
    },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: MaintenanceStatus) => {
        const m = MAINTENANCE_STATUS_MAP[s];
        return <Tag color={m?.color || 'default'}>{m?.label || s}</Tag>;
      },
    },
    { title: 'Создана', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    {
      title: 'Действия', key: 'actions',
      render: (_: unknown, r: MaintenanceRequest) => (
        <Space>
          <Button icon={<EyeOutlined />} size="small" onClick={() => openDrawer(r)} />
          {canManage && <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Заявки на обслуживание</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Создать</Button>
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Всего заявок" value={data?.total ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Открыто" value={(data?.data || []).filter((r) => r.status === 'open' || r.status === 'new').length} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="В работе" value={(data?.data || []).filter((r) => r.status === 'in_progress').length} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Завершено" value={(data?.data || []).filter((r) => r.status === 'completed' || r.status === 'closed').length} /></Card>
        </Col>
      </Row>
      <Table columns={columns} dataSource={data?.data || []} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} pagination={{ current: page, total: data?.total, pageSize: 20, onChange: setPage, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Заявок на обслуживание нет" /> }} />

      {/* Панель деталей */}
      <Drawer
        title={selectedRequest ? `Заявка #${selectedRequest.id}: ${selectedRequest.title}` : 'Детали заявки'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedRequest(null); setNoteText(''); }}
        width={window.innerWidth < 540 ? '100%' : 520}
      >
        {selectedRequest && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Заголовок">{selectedRequest.title}</Descriptions.Item>
              <Descriptions.Item label="Помещение">{selectedRequest.unit?.unitNumber || `ID ${selectedRequest.unitId}`}</Descriptions.Item>
              <Descriptions.Item label="Приоритет">
                <Tag color={TICKET_PRIORITY_MAP[selectedRequest.priority]?.color || 'default'}>
                  {TICKET_PRIORITY_MAP[selectedRequest.priority]?.label || selectedRequest.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={MAINTENANCE_STATUS_MAP[selectedRequest.status]?.color || 'default'}>
                  {MAINTENANCE_STATUS_MAP[selectedRequest.status]?.label || selectedRequest.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Создана">{formatDateTime(selectedRequest.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Обновлена">{formatDateTime(selectedRequest.updatedAt)}</Descriptions.Item>
            </Descriptions>

            {baseDescription && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>Описание</Text>
                <Paragraph style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{baseDescription}</Paragraph>
              </div>
            )}

            <Divider orientation="left">Заметки</Divider>

            {notes.length > 0 ? (
              <Timeline
                style={{ marginBottom: 16 }}
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
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Заметок пока нет</Text>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea
                rows={2}
                placeholder="Добавить заметку..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleAddNote}
                loading={addNoteMutation.isPending}
                disabled={!noteText.trim()}
              >
                Добавить
              </Button>
            </div>
          </>
        )}
      </Drawer>

      <Modal title={editing ? 'Редактировать заявку' : 'Новая заявка'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditing(null); }} confirmLoading={createMutation.isPending || updateMutation.isPending} okText="Сохранить" cancelText="Отмена">
        <Form form={form} layout="vertical">
          {!editing && (
            <Form.Item name="unitId" label="Помещение" rules={[{ required: true, message: 'Выберите помещение' }]}>
              <Select options={(units?.data || []).map((u: Unit) => ({ value: u.id, label: `${u.property?.name || ''} — ${u.unitNumber || u.id}` }))} />
            </Form.Item>
          )}
          <Form.Item name="title" label="Заголовок" rules={[{ required: true, message: 'Введите заголовок' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание" rules={[{ required: true, message: 'Введите описание' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" rules={[{ required: !editing, message: 'Выберите приоритет' }]}>
            <Select options={priorityOptions} />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="Статус">
              <Select options={statusOptions} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default MaintenancePage;
