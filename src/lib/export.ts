/**
 * Export table data to CSV file with UTF-8 BOM for correct display in Excel.
 *
 * @param columns - Array of column definitions with `title` and `dataIndex` (string or string[])
 * @param data - Array of row objects
 * @param filename - Name of the downloaded file (without extension)
 */
export function exportTableToCsv(
  columns: { title: string; dataIndex?: string | string[]; key?: string }[],
  data: Record<string, unknown>[],
  filename: string,
) {
  // Filter out columns without dataIndex (e.g. "actions")
  const exportColumns = columns.filter((c) => c.dataIndex);

  const header = exportColumns.map((c) => escapeCsvField(String(c.title)));

  const rows = data.map((row) =>
    exportColumns.map((col) => {
      const value = getNestedValue(row, col.dataIndex!);
      return escapeCsvField(formatValue(value));
    }),
  );

  const BOM = '\uFEFF';
  const csvContent = BOM + [header, ...rows].map((r) => r.join(';')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

function getNestedValue(obj: Record<string, unknown>, path: string | string[]): unknown {
  const keys = Array.isArray(path) ? path : [path];
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleDateString('ru-RU');
  return String(value);
}

function escapeCsvField(field: string): string {
  if (field.includes(';') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
