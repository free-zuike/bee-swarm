interface HistoryRecord {
  id: string;
  title: string;
  body?: string;
  url?: string;
  time: string;
  channels: string[];
  status: string;
  results: Array<{
    channel: string;
    success: boolean;
    message: string;
    latencyMs?: number;
    retries?: number;
  }>;
}

export function useExport() {
  const exportToJSON = (records: HistoryRecord[], filename = 'push-history.json') => {
    const dataStr = JSON.stringify(records, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    downloadFile(dataBlob, filename);
  };

  const exportToCSV = (records: HistoryRecord[], filename = 'push-history.csv') => {
    const headers = [
      'ID',
      '标题',
      '内容',
      'URL',
      '时间',
      '渠道',
      '状态',
      '成功渠道数',
      '失败渠道数',
    ];
    const rows = records.map((record) => {
      const successCount = record.results.filter((r) => r.success).length;
      const failCount = record.results.length - successCount;
      return [
        record.id,
        `"${record.title.replace(/"/g, '""')}"`,
        record.body ? `"${record.body.replace(/"/g, '""')}"` : '',
        record.url || '',
        record.time,
        record.channels.join('; '),
        record.status,
        successCount,
        failCount,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const dataBlob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(dataBlob, filename);
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return {
    exportToJSON,
    exportToCSV,
  };
}
