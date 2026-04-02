import React, { useState } from 'react';
import { Typography, Card, Descriptions, Tag, Button, Space, Skeleton, Modal, Form, Input, DatePicker, InputNumber, Radio, Row, Col, Statistic, message } from 'antd';
import { SendOutlined, CheckOutlined, StopOutlined, ReloadOutlined, CalendarOutlined, RiseOutlined, FilePdfOutlined, DollarOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import PageBreadcrumb from '../../components/PageBreadcrumb';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contractsApi } from '../../api/endpoints';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { formatDate, formatMoney, formatArea } from '../../lib/format';
import { CONTRACT_STATUS_MAP } from '../../lib/constants';
import type { Contract, ContractStatus, Invoice } from '../../types/models';
import type { RenewContractDto, ExtendContractDto, IndexationPreviewDto } from '../../types/dto';
import { usePageTitle } from '../../lib/usePageTitle';

const { Title, Text } = Typography;

const edoStatusMap: Record<string, { label: string; color: string }> = {
  not_sent: { label: 'Не отправлен', color: 'default' },
  sent: { label: 'Отправлен', color: 'processing' },
  signed: { label: 'Подписан', color: 'success' },
  rejected: { label: 'Отклонён', color: 'error' },
};

const ContractDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const canManage = hasRole('admin', 'manager');
  const [terminateModal, setTerminateModal] = useState(false);
  const [extendModal, setExtendModal] = useState(false);
  const [renewModal, setRenewModal] = useState(false);
  const [indexModal, setIndexModal] = useState(false);
  const [indexPreview, setIndexPreview] = useState<{ newRent: number; difference: number } | null>(null);
  const [terminateReason, setTerminateReason] = useState('');
  const [depositAction, setDepositAction] = useState<'return' | 'withhold' | 'partial'>('return');
  const [depositWithheldAmount, setDepositWithheldAmount] = useState<number>(0);
  const [depositWithheldReason, setDepositWithheldReason] = useState('');
  const [extendForm] = Form.useForm();
  const [renewForm] = Form.useForm();
  const [indexForm] = Form.useForm();

  const { data: contract, isLoading } = useQuery<Contract>({
    queryKey: ['contract', id],
    queryFn: () => contractsApi.get(Number(id)),
    enabled: !!id,
  });

  usePageTitle(contract ? `Договор ${contract.contractNumber}` : 'Договор');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contract', id] });

  const signMutation = useMutation({
    mutationFn: () => contractsApi.sign(Number(id)),
    onSuccess: () => { invalidate(); message.success('Договор подписан'); },
    onError: () => message.error('Ошибка'),
  });

  const sendEdoMutation = useMutation({
    mutationFn: () => contractsApi.sendEdo(Number(id)),
    onSuccess: () => { invalidate(); message.success('Отправлен в ЭДО'); },
    onError: () => message.error('Ошибка'),
  });

  const terminateMutation = useMutation({
    mutationFn: (dto: { reason?: string; depositAction?: 'return' | 'withhold' | 'partial'; depositWithheldAmount?: number; depositWithheldReason?: string }) => contractsApi.terminate(Number(id), dto),
    onSuccess: () => { invalidate(); setTerminateModal(false); message.success('Договор расторгнут'); },
    onError: () => message.error('Ошибка'),
  });

  const extendMutation = useMutation({
    mutationFn: (data: ExtendContractDto) => contractsApi.extend(Number(id), data),
    onSuccess: () => { invalidate(); setExtendModal(false); message.success('Договор продлён'); },
    onError: () => message.error('Ошибка'),
  });

  const renewMutation = useMutation({
    mutationFn: (data: RenewContractDto) => contractsApi.renew(Number(id), data),
    onSuccess: () => { invalidate(); setRenewModal(false); message.success('Договор перезаключён'); },
    onError: () => message.error('Ошибка'),
  });

  const indexPreviewMutation = useMutation({
    mutationFn: (dto: IndexationPreviewDto) => contractsApi.indexationPreview(dto),
    onSuccess: (data) => setIndexPreview(data as { newRent: number; difference: number }),
    onError: () => message.error('Ошибка предпросмотра'),
  });

  const indexApplyMutation = useMutation({
    mutationFn: () => {
      const v = indexForm.getFieldsValue();
      return contractsApi.indexationApply({ contractIds: [Number(id)], rate: v.rate });
    },
    onSuccess: () => { invalidate(); setIndexModal(false); setIndexPreview(null); message.success('Индексация применена'); },
    onError: () => message.error('Ошибка'),
  });

  const downloadFile = async (url: string, filename: string) => {
    try {
      message.loading({ content: 'Генерация документа...', key: 'pdf-download', duration: 0 });
      const response = await api.get(url, { responseType: 'blob', timeout: 120_000 });
      message.destroy('pdf-download');
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      // Задержка отзыва URL, чтобы браузер успел начать скачивание
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 500);
    } catch (err) {
      message.destroy('pdf-download');
      console.error('Download error:', err);
      message.error('Ошибка генерации документа. Проверьте что бэкенд запущен.');
    }
  };

  const downloadPdf = () => downloadFile(
    `/contracts/${id}/pdf`,
    `contract-${contract?.contractNumber || id}.pdf`,
  );

  const downloadHandoverAct = () => downloadFile(
    `/contracts/${id}/handover-act`,
    `handover-act-${contract?.contractNumber || id}.pdf`,
  );

  const downloadReconciliation = () => downloadFile(
    `/contracts/${id}/reconciliation`,
    `reconciliation-${contract?.contractNumber || id}.pdf`,
  );

  if (isLoading) return <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>;
  if (!contract) return null;

  const statusInfo = CONTRACT_STATUS_MAP[contract.status as ContractStatus];
  const edoInfo = edoStatusMap[contract.edoStatus || 'not_sent'] || { label: '—', color: 'default' };

  return (
    <div>
      <PageBreadcrumb items={[
        { title: 'Объекты', path: '/properties' },
        ...(contract.unit?.property ? [{ title: contract.unit.property.name, path: `/properties/${contract.unit.propertyId}` }] : []),
        ...(contract.unit ? [{ title: contract.unit.unitNumber || `Помещение #${contract.unitId}`, path: `/units/${contract.unitId}` }] : []),
        { title: contract.contractNumber },
      ]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>Договор {contract.contractNumber}</Title>
          <Tag color={statusInfo?.color || 'default'}>{statusInfo?.label || contract.status}</Tag>
        </Space>
        <Space wrap>
          {/* Документы — все роли */}
          <Button icon={<FilePdfOutlined />} onClick={downloadPdf}>Договор PDF</Button>
          <Button icon={<FilePdfOutlined />} onClick={downloadHandoverAct}>Акт приёма-передачи</Button>
          <Button icon={<FilePdfOutlined />} onClick={downloadReconciliation}>Акт сверки</Button>
          {/* Действия — только manager+ */}
          {canManage && (contract.status === 'draft' || contract.status === 'sent') && (
            <Button type="primary" icon={<CheckOutlined />} onClick={() => signMutation.mutate()} loading={signMutation.isPending}>Подписать</Button>
          )}
          {canManage && contract.status === 'active' && contract.edoStatus !== 'sent' && contract.edoStatus !== 'signed' && (
            <Button icon={<SendOutlined />} onClick={() => sendEdoMutation.mutate()} loading={sendEdoMutation.isPending}>Отправить в ЭДО</Button>
          )}
          {canManage && contract.status === 'active' && (
            <>
              <Button icon={<RiseOutlined />} onClick={() => { indexForm.resetFields(); setIndexPreview(null); setIndexModal(true); }}>Индексация</Button>
              <Button icon={<CalendarOutlined />} onClick={() => { extendForm.resetFields(); setExtendModal(true); }}>Продлить</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { renewForm.resetFields(); setRenewModal(true); }}>Перезаключить</Button>
              <Button danger icon={<StopOutlined />} onClick={() => setTerminateModal(true)}>Расторгнуть</Button>
            </>
          )}
        </Space>
      </div>

      <Card title="Основные данные" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Номер">{contract.contractNumber}</Descriptions.Item>
          <Descriptions.Item label="Статус"><Tag color={statusInfo?.color || 'default'}>{statusInfo?.label || contract.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Начало">{formatDate(contract.startDate)}</Descriptions.Item>
          <Descriptions.Item label="Окончание">{formatDate(contract.endDate)}</Descriptions.Item>
          <Descriptions.Item label="Аренда/мес">{formatMoney(contract.monthlyRent)}</Descriptions.Item>
          <Descriptions.Item label="Депозит">{contract.depositAmount ? formatMoney(contract.depositAmount) : '—'}{(() => {
            const ds = (contract as any).depositStatus;
            if (!ds) return null;
            const map: Record<string, { label: string; color: string }> = { pending: { label: 'Ожидает оплаты', color: 'orange' }, paid: { label: 'Оплачен', color: 'blue' }, returned: { label: 'Возвращён', color: 'green' }, partially_withheld: { label: 'Частично удержан', color: 'warning' }, withheld: { label: 'Удержан', color: 'red' } };
            const m = map[ds] || { label: ds, color: 'default' };
            return <Tag color={m.color} style={{ marginLeft: 8 }}>{m.label}</Tag>;
          })()}</Descriptions.Item>
          <Descriptions.Item label="День оплаты">{contract.paymentDay}</Descriptions.Item>
          <Descriptions.Item label="Создан">{formatDate(contract.createdAt)}</Descriptions.Item>
          {contract.signedAt && <Descriptions.Item label="Подписан">{formatDate(contract.signedAt)}</Descriptions.Item>}
          {contract.terminatedAt && <Descriptions.Item label="Расторгнут">{formatDate(contract.terminatedAt)}</Descriptions.Item>}
          {contract.terminationReason && <Descriptions.Item label="Причина расторжения" span={2}><Text type="danger">{contract.terminationReason}</Text></Descriptions.Item>}
          {(contract as any).depositWithheldAmount > 0 && <Descriptions.Item label="Удержано из депозита">{formatMoney((contract as any).depositWithheldAmount)}</Descriptions.Item>}
          {(contract as any).depositReturnedAmount > 0 && <Descriptions.Item label="Возвращено из депозита">{formatMoney((contract as any).depositReturnedAmount)}</Descriptions.Item>}
          {(contract as any).depositWithheldReason && <Descriptions.Item label="Причина удержания" span={2}><Text type="warning">{(contract as any).depositWithheldReason}</Text></Descriptions.Item>}
        </Descriptions>
      </Card>

      {/* Финансы по договору */}
      {contract.invoices && contract.invoices.length > 0 && (() => {
        const invoices = contract.invoices as Invoice[];
        const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
        const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.totalAmount, 0);
        const outstanding = totalBilled - totalPaid;
        const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
        return (
          <Card title="Финансы по договору" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic title="Выставлено" value={formatMoney(totalBilled)} prefix={<DollarOutlined />} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="Оплачено" value={formatMoney(totalPaid)} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="К оплате" value={formatMoney(outstanding)} prefix={<ClockCircleOutlined />} valueStyle={{ color: outstanding > 0 ? '#faad14' : undefined }} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="Просрочено счетов" value={overdueCount} prefix={<WarningOutlined />} valueStyle={{ color: overdueCount > 0 ? '#ff4d4f' : undefined }} />
              </Col>
            </Row>
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Следующий счёт: {contract.paymentDay}-е число следующего месяца</Text>
            </div>
          </Card>
        );
      })()}

      <Card title="Клиент" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Компания">{contract.client?.companyName || '—'}</Descriptions.Item>
          <Descriptions.Item label="ИНН">{contract.client?.inn || '—'}</Descriptions.Item>
          <Descriptions.Item label="Контакт">{contract.client?.contactName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{contract.client?.contactEmail || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Помещение" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Объект">{contract.unit?.property?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Номер">{contract.unit?.unitNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Площадь">{contract.unit ? formatArea(contract.unit.areaSqm) : '—'}</Descriptions.Item>
          <Descriptions.Item label="Этаж">{contract.unit?.floor ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Электронный документооборот">
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Статус ЭДО"><Tag color={edoInfo.color}>{edoInfo.label}</Tag></Descriptions.Item>
          <Descriptions.Item label="Провайдер">{contract.edoProvider || '—'}</Descriptions.Item>
          {contract.edoSentAt && <Descriptions.Item label="Отправлен">{formatDate(contract.edoSentAt)}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Modal title="Расторжение договора" open={terminateModal} onOk={() => terminateMutation.mutate({ reason: terminateReason, depositAction, depositWithheldAmount: depositAction === 'partial' ? depositWithheldAmount : undefined, depositWithheldReason: depositAction !== 'return' ? depositWithheldReason : undefined })} onCancel={() => setTerminateModal(false)} confirmLoading={terminateMutation.isPending} okText="Расторгнуть" okButtonProps={{ danger: true }} cancelText="Отмена" width={window.innerWidth < 500 ? '95%' : 520}>
        <Input.TextArea rows={3} placeholder="Причина расторжения..." value={terminateReason} onChange={(e) => setTerminateReason(e.target.value)} style={{ marginBottom: 16 }} />
        {contract?.depositAmount && Number(contract.depositAmount) > 0 && (
          <Card size="small" title={`Депозит: ${formatMoney(Number(contract.depositAmount))}`} style={{ marginTop: 8 }}>
            <Radio.Group value={depositAction} onChange={(e) => setDepositAction(e.target.value)} style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="return">Вернуть полностью</Radio>
                <Radio value="partial">Удержать частично</Radio>
                <Radio value="withhold">Удержать полностью</Radio>
              </Space>
            </Radio.Group>
            {depositAction === 'partial' && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Сумма удержания:</Text>
                <InputNumber min={0} max={Number(contract.depositAmount)} value={depositWithheldAmount} onChange={(v) => setDepositWithheldAmount(v || 0)} style={{ width: '100%' }} addonAfter="₽" />
                <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>К возврату: {formatMoney(Number(contract.depositAmount) - depositWithheldAmount)}</Text>
              </div>
            )}
            {depositAction !== 'return' && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Причина удержания:</Text>
                <Input.TextArea rows={2} placeholder="Повреждения, задолженность..." value={depositWithheldReason} onChange={(e) => setDepositWithheldReason(e.target.value)} />
              </div>
            )}
          </Card>
        )}
      </Modal>

      <Modal title="Продление договора" open={extendModal} onOk={() => extendForm.validateFields().then((v) => extendMutation.mutate({ newEndDate: v.newEndDate.format('YYYY-MM-DD') }))} onCancel={() => setExtendModal(false)} confirmLoading={extendMutation.isPending} okText="Продлить" cancelText="Отмена">
        <Form form={extendForm} layout="vertical">
          <Form.Item name="newEndDate" label="Новая дата окончания" rules={[{ required: true, message: 'Выберите дату' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Перезаключение договора" open={renewModal} onOk={() => renewForm.validateFields().then((v) => renewMutation.mutate({ newEndDate: v.newEndDate.format('YYYY-MM-DD'), newMonthlyRent: v.newMonthlyRent }))} onCancel={() => setRenewModal(false)} confirmLoading={renewMutation.isPending} okText="Перезаключить" cancelText="Отмена">
        <Form form={renewForm} layout="vertical">
          <Form.Item name="newEndDate" label="Новая дата окончания" rules={[{ required: true, message: 'Выберите дату' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="newMonthlyRent" label="Новая арендная ставка (необязательно)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Индексация аренды" open={indexModal} onOk={() => indexApplyMutation.mutate()} onCancel={() => { setIndexModal(false); setIndexPreview(null); }} confirmLoading={indexApplyMutation.isPending} okText="Применить" okButtonProps={{ disabled: !indexPreview }} cancelText="Отмена">
        <Form form={indexForm} layout="vertical">
          <Form.Item name="rate" label="Ставка индексации (%)" rules={[{ required: true, message: 'Укажите процент' }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Button onClick={() => indexForm.validateFields().then((v) => indexPreviewMutation.mutate({ contractId: Number(id), rate: v.rate }))} loading={indexPreviewMutation.isPending} style={{ marginBottom: 16 }}>Предпросмотр</Button>
        </Form>
        {indexPreview && (
          <Card size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Текущая ставка">{formatMoney(contract?.monthlyRent || 0)}</Descriptions.Item>
              <Descriptions.Item label="Новая ставка">{formatMoney(indexPreview.newRent)}</Descriptions.Item>
              <Descriptions.Item label="Разница">{formatMoney(indexPreview.difference)}</Descriptions.Item>
            </Descriptions>
          </Card>
        )}
      </Modal>
    </div>
  );
};

export default ContractDetailPage;
