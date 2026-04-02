import React, { useState, useMemo } from 'react';
import { Typography, Card, Upload, Button, Select, Table, Tag, Space, Steps, Alert, message, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  FileExcelOutlined,
  InboxOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importApi } from '../../api/endpoints';
import { formatDate } from '../../lib/format';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const importTypes = [
  { value: 'properties', label: 'Объекты недвижимости', description: 'Название, адрес, тип, площадь' },
  { value: 'units', label: 'Помещения', description: 'Объект, номер, этаж, площадь, цена' },
  { value: 'clients', label: 'Клиенты (арендаторы)', description: 'Компания, ИНН, КПП, контакт, email' },
  { value: 'contracts', label: 'Договоры', description: 'Номер, компания, помещение, даты, ставка' },
];

/** Ожидаемые колонки по типу импорта (соответствуют шаблонам на бэкенде) */
const expectedColumns: Record<string, { name: string; required: boolean }[]> = {
  properties: [
    { name: 'Название', required: true },
    { name: 'Адрес', required: true },
    { name: 'Тип', required: false },
    { name: 'Площадь', required: false },
  ],
  units: [
    { name: 'Объект', required: true },
    { name: 'Номер', required: false },
    { name: 'Этаж', required: true },
    { name: 'Площадь', required: true },
    { name: 'Цена', required: true },
    { name: 'Статус', required: false },
    { name: 'Описание', required: false },
  ],
  clients: [
    { name: 'Компания', required: true },
    { name: 'ИНН', required: false },
    { name: 'КПП', required: false },
    { name: 'Контакт', required: true },
    { name: 'Email', required: true },
    { name: 'Телефон', required: false },
  ],
  contracts: [
    { name: 'Номер договора', required: true },
    { name: 'Компания (ИНН)', required: true },
    { name: 'Помещение', required: false },
    { name: 'Дата начала', required: true },
    { name: 'Дата окончания', required: true },
    { name: 'Ставка', required: true },
  ],
};

/** Тип данных предпросмотра, возвращаемых бэкендом */
interface PreviewData {
  id: number;
  totalRows: number;
  status: string;
  type: string;
  preview: {
    headers: string[];
    rows: string[][];
    rowErrors: (string | null)[];
    totalRows: number;
    errorCount: number;
  };
}

const ImportPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [importType, setImportType] = useState('units');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: () => importApi.jobs(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => importApi.upload(importType, file),
    onSuccess: (data: PreviewData) => {
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      setPreviewData(data);
      setUploadError(null);
      const errCount = data.preview?.errorCount ?? 0;
      if (errCount > 0) {
        message.warning(`Файл загружен. Обнаружено ${errCount} строк с ошибками. Проверьте предпросмотр.`);
      } else {
        message.success('Файл загружен. Проверьте предпросмотр и подтвердите импорт.');
      }
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      const detail =
        axiosErr?.response?.data?.message ||
        axiosErr?.message ||
        'Неизвестная ошибка при загрузке файла';
      setUploadError(detail);
      setPreviewData(null);
      message.error('Ошибка загрузки файла');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => importApi.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      setPreviewData(null);
      message.success('Импорт подтверждён');
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      const detail =
        axiosErr?.response?.data?.message ||
        axiosErr?.message ||
        'Неизвестная ошибка при подтверждении импорта';
      message.error(`Ошибка подтверждения: ${detail}`);
    },
  });

  const downloadTemplate = async () => {
    try {
      const { default: apiClient } = await import('../../api/client');
      const response = await apiClient.get(`/import/template`, { params: { type: importType }, responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-${importType}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 500);
      message.success('Шаблон скачан');
    } catch { message.error('Ошибка скачивания шаблона'); }
  };

  // ── Preview table columns (dynamic based on upload response) ──
  const previewColumns = useMemo(() => {
    if (!previewData?.preview?.headers) return [];
    const cols: { title: string; dataIndex: string; key: string; ellipsis?: boolean; width?: number; render?: (_: unknown) => React.ReactNode }[] =
      previewData.preview.headers.map((h, idx) => ({
        title: h,
        dataIndex: `col_${idx}`,
        key: `col_${idx}`,
        ellipsis: true,
      }));
    // Добавление колонки ошибок в конец
    cols.push({
      title: 'Статус',
      dataIndex: '_error',
      key: '_error',
      width: 260,
    });
    return cols;
  }, [previewData]);

  const previewDataSource = useMemo(() => {
    if (!previewData?.preview?.rows) return [];
    return previewData.preview.rows.map((row, rowIdx) => {
      const record: Record<string, unknown> = { key: rowIdx };
      row.forEach((cell, colIdx) => {
        record[`col_${colIdx}`] = cell || '';
      });
      const err = previewData.preview.rowErrors?.[rowIdx] ?? null;
      record['_error'] = err ? (
        <Tooltip title={err}>
          <Tag color="red" style={{ whiteSpace: 'normal', maxWidth: 240 }}>
            <ExclamationCircleOutlined /> {err}
          </Tag>
        </Tooltip>
      ) : (
        <Tag color="green"><CheckCircleOutlined /> OK</Tag>
      );
      return record;
    });
  }, [previewData]);

  const jobList = Array.isArray(jobs) ? jobs : (jobs as { data?: unknown[] })?.data || [];

  // ── History table columns ──
  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: 'Тип', dataIndex: 'type', key: 'type',
      render: (t: string) => importTypes.find((x) => x.value === t)?.label || t,
    },
    {
      title: 'Статус', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const map: Record<string, { color: string; label: string }> = {
          preview: { color: 'blue', label: 'Предпросмотр' },
          pending: { color: 'gold', label: 'В очереди' },
          processing: { color: 'processing', label: 'Обработка' },
          importing: { color: 'processing', label: 'Импорт...' },
          completed: { color: 'green', label: 'Завершён' },
          completed_with_errors: { color: 'orange', label: 'Завершён с ошибками' },
          failed: { color: 'red', label: 'Ошибка' },
        };
        const info = map[s] || { color: 'default', label: s };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: 'Записей', dataIndex: 'totalRows', key: 'rows' },
    { title: 'Успешно', dataIndex: 'importedRows', key: 'success' },
    { title: 'Ошибок', dataIndex: 'errorRows', key: 'errors', render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : '0' },
    { title: 'Дата', dataIndex: 'createdAt', key: 'date', render: (d: string) => formatDate(d) },
    {
      title: '', key: 'actions',
      render: (_: unknown, r: { id: number; status: string }) => (
        r.status === 'preview' ? (
          <Button icon={<CheckCircleOutlined />} size="small" type="primary" onClick={() => confirmMutation.mutate(r.id)}>
            Подтвердить
          </Button>
        ) : null
      ),
    },
  ];

  const selectedType = importTypes.find((t) => t.value === importType);
  const currentExpectedCols = expectedColumns[importType] || [];
  const preview = previewData?.preview;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>Массовый импорт данных</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Загрузите CSV или Excel файл для массового добавления объектов, помещений или клиентов
      </Text>

      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={previewData ? 3 : 0}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Выберите тип', description: 'Что импортировать' },
            { title: 'Скачайте шаблон', description: 'CSV с заголовками' },
            { title: 'Заполните данные', description: 'В Excel или Google Sheets' },
            { title: 'Загрузите файл', description: 'И подтвердите' },
          ]}
        />

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>1. Тип данных для импорта:</Text>
            <Select
              value={importType}
              onChange={(v) => { setImportType(v); setPreviewData(null); setUploadError(null); }}
              style={{ width: 360 }}
              size="large"
              options={importTypes.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
            {selectedType && (
              <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
                {selectedType.description}
              </Text>
            )}
          </div>

          {/* Подсказка по столбцам */}
          {currentExpectedCols.length > 0 && (
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="Ожидаемые колонки"
              description={
                <div style={{ marginTop: 4 }}>
                  <Space wrap size={[4, 4]}>
                    {currentExpectedCols.map((col) => (
                      <Tag
                        key={col.name}
                        color={col.required ? 'blue' : 'default'}
                      >
                        {col.name}{col.required ? ' *' : ''}
                      </Tag>
                    ))}
                  </Space>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Поля, отмеченные *, обязательны для заполнения. Порядок колонок должен соответствовать шаблону.
                    </Text>
                  </div>
                </div>
              }
            />
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>2. Скачайте шаблон:</Text>
            <Button icon={<FileExcelOutlined />} onClick={downloadTemplate} size="large">
              Скачать шаблон для «{selectedType?.label}»
            </Button>
            <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              Откройте файл в Excel, заполните данные и сохраните как CSV (разделитель — точка с запятой)
            </Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>3. Загрузите заполненный файл:</Text>
            <Dragger
              accept=".xlsx,.xls,.csv"
              showUploadList={false}
              beforeUpload={(file) => { uploadMutation.mutate(file); return false; }}
              style={{ padding: '20px 0' }}
              disabled={uploadMutation.isPending}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">
                {uploadMutation.isPending ? 'Загрузка...' : 'Нажмите или перетащите файл сюда'}
              </p>
              <p className="ant-upload-hint">Поддерживаются форматы: CSV, XLS, XLSX</p>
            </Dragger>
          </div>
        </Space>
      </Card>

      {/* Отображение ошибок загрузки */}
      {uploadError && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setUploadError(null)}
          style={{ marginBottom: 16 }}
          message="Ошибка загрузки"
          description={
            <div>
              <Paragraph style={{ marginBottom: 4 }}>{uploadError}</Paragraph>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Убедитесь, что файл соответствует шаблону и содержит данные. Попробуйте скачать шаблон и заполнить его заново.
              </Text>
            </div>
          }
        />
      )}

      {/* Секция предпросмотра */}
      {preview && previewData && (
        <Card
          title={
            <Space>
              <span>Предпросмотр загруженных данных</span>
              <Tag color={preview.errorCount > 0 ? 'orange' : 'green'}>
                {preview.totalRows} записей{preview.errorCount > 0 ? `, ${preview.errorCount} с ошибками` : ''}
              </Tag>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          {/* Итоговое уведомление */}
          {preview.errorCount > 0 ? (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              style={{ marginBottom: 16 }}
              message={`${preview.errorCount} из ${preview.totalRows} записей содержат ошибки`}
              description="Строки с ошибками выделены красным. Вы можете подтвердить импорт — корректные записи будут импортированы, ошибочные — пропущены."
            />
          ) : (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 16 }}
              message={`Все ${preview.totalRows} записей прошли валидацию`}
              description="Нажмите «Подтвердить импорт» для начала загрузки данных в систему."
            />
          )}

          {preview.totalRows > 50 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Показаны первые 50 из ${preview.totalRows} строк`}
            />
          )}

          <Table
            columns={previewColumns}
            dataSource={previewDataSource}
            size="small"
            pagination={previewDataSource.length > 10 ? { pageSize: 10 } : false}
            scroll={{ x: 'max-content' }}
            rowClassName={(record) => {
              const idx = record.key as number;
              return preview.rowErrors?.[idx] ? 'import-row-error' : '';
            }}
          />

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              loading={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(previewData.id)}
            >
              Подтвердить импорт
            </Button>
            <Button
              size="large"
              onClick={() => setPreviewData(null)}
            >
              Отменить
            </Button>
          </div>
        </Card>
      )}

      <Card title="История импорта">
        {(jobList as Record<string, unknown>[]).length === 0 && !isLoading ? (
          <Alert message="Нет загрузок" description="Загрузите файл выше, и он появится здесь для подтверждения" type="info" showIcon />
        ) : (
          <Table
            columns={columns}
            dataSource={jobList as Record<string, unknown>[]}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* Встроенные стили для подсветки строк */}
      <style>{`
        .import-row-error td {
          background-color: #fff2f0 !important;
        }
        .import-row-error:hover td {
          background-color: #ffece8 !important;
        }
      `}</style>
    </div>
  );
};

export default ImportPage;
