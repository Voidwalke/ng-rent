import React, { useState } from 'react';
import { Typography, Card, Tag, Button, Input, Skeleton, Space, List, Avatar, message, theme } from 'antd';
import { SendOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '../../api/endpoints';
import { formatDateTime } from '../../lib/format';
import { TICKET_STATUS_MAP, TICKET_PRIORITY_MAP } from '../../lib/constants';
import { useAuthStore } from '../../store/auth';
import type { SupportTicket, SupportMessage } from '../../types/models';

const { Title, Text } = Typography;

const SupportTicketPage: React.FC = () => {
  const { token } = theme.useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [newMessage, setNewMessage] = useState('');

  const { data: ticketData, isLoading: ticketLoading } = useQuery<SupportTicket & { messages: SupportMessage[] }>({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(Number(id)),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const ticket = ticketData;
  const messages = ticketData?.messages;
  const msgsLoading = ticketLoading;

  const sendMutation = useMutation({
    mutationFn: (msg: string) => ticketsApi.addMessage(Number(id), { message: msg }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket', id] }); setNewMessage(''); },
    onError: () => message.error('Ошибка отправки'),
  });

  const closeMutation = useMutation({
    mutationFn: () => ticketsApi.close(Number(id)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ticket', id] }); message.success('Обращение закрыто'); },
    onError: () => message.error('Ошибка'),
  });

  if (ticketLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!ticket) return null;

  const statusInfo = TICKET_STATUS_MAP[ticket.status];
  const priorityInfo = TICKET_PRIORITY_MAP[ticket.priority];
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMutation.mutate(newMessage.trim());
  };

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: 'Поддержка', path: location.pathname.startsWith('/my') ? '/my/tickets' : '/support' },
          { title: `Обращение #${id}` },
        ]}
        homeUrl={location.pathname.startsWith('/my') ? '/my' : '/dashboard'}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>#{ticket.id}: {ticket.subject}</Title>
          <Tag color={statusInfo?.color || 'default'}>{statusInfo?.label || ticket.status}</Tag>
          <Tag color={priorityInfo?.color || 'default'}>{priorityInfo?.label || ticket.priority}</Tag>
        </Space>
        {!isClosed && (
          <Space>
            <Button icon={<CheckCircleOutlined />} onClick={() => closeMutation.mutate()} loading={closeMutation.isPending}>
              Закрыть
            </Button>
          </Space>
        )}
      </div>

      <Card
        title="Сообщения"
        style={{ marginBottom: 16 }}
        bodyStyle={{ maxHeight: 500, overflowY: 'auto', padding: '12px 24px' }}
      >
        {msgsLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <List
            dataSource={messages || []}
            locale={{ emptyText: 'Нет сообщений' }}
            renderItem={(msg: SupportMessage) => {
              const isMe = msg.senderId === user?.id;
              const isSystem = msg.senderType === 'system';
              return (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '8px 16px',
                      borderRadius: 12,
                      background: isSystem ? token.colorBorderSecondary : isMe ? '#2563eb' : token.colorBgLayout,
                      color: isMe ? '#fff' : token.colorText,
                    }}
                  >
                    {!isMe && (
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4, color: isMe ? '#fff' : '#2563eb' }}>
                        {isSystem ? 'Система' : 'Поддержка'}
                      </Text>
                    )}
                    <Text style={{ color: isMe ? '#fff' : token.colorText }}>{msg.message}</Text>
                    <br />
                    <Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.7)' : token.colorTextQuaternary }}>
                      {formatDateTime(msg.createdAt)}
                    </Text>
                  </div>
                </div>
              );
            }}
          />
        )}
      </Card>

      {!isClosed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Введите сообщение..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sendMutation.isPending} style={{ alignSelf: 'flex-end' }}>
            Отправить
          </Button>
        </div>
      )}
    </div>
  );
};

export default SupportTicketPage;
