import { ref } from 'vue';

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

export type ExportFormat = 'json' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  dateRange?: {
    start: string;
    end: string;
  };
  onProgress?: (progress: number) => void;
}

export function useExport() {
  const progress = ref(0);
  const isExporting = ref(false);

  function filterByDateRange(
    records: HistoryRecord[],
    dateRange?: { start: string; end: string }
  ): HistoryRecord[] {
    if (!dateRange?.start && !dateRange?.end) return records;

    const start = dateRange?.start ? new Date(dateRange.start).getTime() : 0;
    const end = dateRange?.end ? new Date(dateRange.end).getTime() : Date.now();

    return records.filter((record) => {
      const recordTime = new Date(record.time).getTime();
      return recordTime >= start && recordTime <= end;
    });
  }

  const exportToJSON = (
    records: HistoryRecord[],
    filename = 'push-history.json',
    options?: ExportOptions
  ) => {
    isExporting.value = true;
    progress.value = 0;

    try {
      let filtered = records;
      if (options?.dateRange) {
        filtered = filterByDateRange(records, options.dateRange);
      }

      options?.onProgress?.(10);
      progress.value = 10;

      const exportData = {
        exportedAt: new Date().toISOString(),
        totalRecords: filtered.length,
        records: filtered,
      };

      options?.onProgress?.(50);
      progress.value = 50;

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });

      options?.onProgress?.(80);
      progress.value = 80;

      downloadFile(dataBlob, filename);

      options?.onProgress?.(100);
      progress.value = 100;
    } finally {
      setTimeout(() => {
        isExporting.value = false;
        progress.value = 0;
      }, 500);
    }
  };

  const exportToCSV = (
    records: HistoryRecord[],
    filename = 'push-history.csv',
    options?: ExportOptions
  ) => {
    isExporting.value = true;
    progress.value = 0;

    try {
      let filtered = records;
      if (options?.dateRange) {
        filtered = filterByDateRange(records, options.dateRange);
      }

      options?.onProgress?.(10);
      progress.value = 10;

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

      const batchSize = 100;
      const batches = Math.ceil(filtered.length / batchSize);
      const rows: string[][] = [];

      for (let i = 0; i < batches; i++) {
        const batch = filtered.slice(i * batchSize, (i + 1) * batchSize);
        for (const record of batch) {
          const successCount = record.results.filter((r) => r.success).length;
          const failCount = record.results.length - successCount;
          rows.push([
            record.id,
            `"${record.title.replace(/"/g, '""')}"`,
            record.body ? `"${record.body.replace(/"/g, '""')}"` : '',
            record.url || '',
            record.time,
            record.channels.join('; '),
            record.status,
            String(successCount),
            String(failCount),
          ]);
        }
        options?.onProgress?.(10 + (i / batches) * 70);
        progress.value = 10 + (i / batches) * 70;
      }

      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      const dataBlob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });

      options?.onProgress?.(90);
      progress.value = 90;

      downloadFile(dataBlob, filename);

      options?.onProgress?.(100);
      progress.value = 100;
    } finally {
      setTimeout(() => {
        isExporting.value = false;
        progress.value = 0;
      }, 500);
    }
  };

  const exportData = (records: HistoryRecord[], filename: string, options: ExportOptions) => {
    if (options.format === 'csv') {
      exportToCSV(records, filename, options);
    } else {
      exportToJSON(records, filename, options);
    }
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
    exportData,
    progress,
    isExporting,
    filterByDateRange,
  };
}
