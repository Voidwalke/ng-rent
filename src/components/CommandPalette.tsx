import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Input, List, Typography, Tag, theme } from 'antd';
import { SearchOutlined, BankOutlined, TeamOutlined, FileTextOutlined, DollarOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { propertiesApi, clientsApi, contractsApi, invoicesApi } from '../api/endpoints';

const { Text } = Typography;

interface SearchResult {
  type: 'property' | 'client' | 'contract' | 'invoice' | 'unit';
  id: number;
  title: string;
  subtitle?: string;
  path: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  property: { label: 'Объект', color: 'blue', icon: <BankOutlined /> },
  unit: { label: 'Помещение', color: 'cyan', icon: <HomeOutlined /> },
  client: { label: 'Контрагент', color: 'green', icon: <TeamOutlined /> },
  contract: { label: 'Договор', color: 'purple', icon: <FileTextOutlined /> },
  invoice: { label: 'Счёт', color: 'orange', icon: <DollarOutlined /> },
};

const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const inputRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const [props, clients, contracts, invoices] = await Promise.allSettled([
        propertiesApi.list({ search: q, limit: 5 }),
        clientsApi.list({ search: q, limit: 5 }),
        contractsApi.list({ search: q, limit: 5 }),
        invoicesApi.list({ search: q, limit: 5 }),
      ]);

      const items: SearchResult[] = [];

      if (props.status === 'fulfilled' && props.value?.data) {
        for (const p of props.value.data) {
          items.push({ type: 'property', id: p.id, title: p.name, subtitle: p.address, path: `/properties/${p.id}` });
        }
      }
      if (clients.status === 'fulfilled' && clients.value?.data) {
        for (const c of clients.value.data) {
          items.push({ type: 'client', id: c.id, title: c.companyName, subtitle: c.inn || '', path: `/clients` });
        }
      }
      if (contracts.status === 'fulfilled' && contracts.value?.data) {
        for (const c of contracts.value.data) {
          items.push({ type: 'contract', id: c.id, title: c.contractNumber, subtitle: (c as any).client?.companyName || '', path: `/contracts/${c.id}` });
        }
      }
      if (invoices.status === 'fulfilled' && invoices.value?.data) {
        for (const inv of invoices.value.data) {
          items.push({ type: 'invoice', id: inv.id, title: inv.invoiceNumber, subtitle: inv.status, path: `/invoices` });
        }
      }
      setResults(items);
      setSelectedIndex(0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    navigate(item.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      closable={false}
      width={560}
      styles={{ body: { padding: 0 } }}
      style={{ top: 80 }}
    >
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Input
          ref={inputRef}
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          placeholder="Поиск по объектам, клиентам, договорам, счетам..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="borderless"
          size="large"
          suffix={<Tag style={{ margin: 0 }}>⌘K</Tag>}
        />
      </div>
      {query.length >= 2 && (
        <List
          loading={loading}
          dataSource={results}
          locale={{ emptyText: loading ? 'Поиск...' : 'Ничего не найдено' }}
          style={{ maxHeight: 400, overflow: 'auto' }}
          renderItem={(item, index) => {
            const cfg = TYPE_CONFIG[item.type];
            return (
              <List.Item
                onClick={() => handleSelect(item)}
                style={{
                  cursor: 'pointer',
                  padding: '10px 16px',
                  background: index === selectedIndex ? token.colorPrimaryBg : undefined,
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <List.Item.Meta
                  avatar={<span style={{ fontSize: 16, color: token.colorTextSecondary }}>{cfg.icon}</span>}
                  title={<Text>{item.title}</Text>}
                  description={item.subtitle && <Text type="secondary" style={{ fontSize: 12 }}>{item.subtitle}</Text>}
                />
                <Tag color={cfg.color} style={{ marginLeft: 8 }}>{cfg.label}</Tag>
              </List.Item>
            );
          }}
        />
      )}
      {query.length < 2 && (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <Text type="secondary">Введите минимум 2 символа для поиска</Text>
        </div>
      )}
    </Modal>
  );
};

export default CommandPalette;
