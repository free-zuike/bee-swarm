<script setup lang="ts">
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { useExport } from '@/composables/useExport';
import type { ChannelConfig } from '@/types';

const { showToast } = useGlobalToast();

interface ChannelResult {
  channel: string;
  success: boolean;
  message: string;
  latencyMs?: number;
  retries?: number;
}

interface HistoryRecord {
  id: string;
  title: string;
  body?: string;
  url?: string;
  time: string;
  channels: string[];
  status: string;
  results: ChannelResult[];
}

const props = defineProps<{
  history: HistoryRecord[];
  loading?: boolean;
  channels: ChannelConfig[];
  total?: number;
  accessToken?: string;
}>();

const emit = defineEmits<{
  'load-page': [page: number];
  clear: [];
  'batch-delete': [ids: string[]];
  'filter-change': [filters: { channel?: string; status?: string; search?: string }];
  resend: [record: HistoryRecord];
}>();

const locale = computed(() => {
  const lang = localStorage.getItem('bee_swarm_locale') || 'zh';
  return lang === 'zh' ? 'zh-CN' : 'en-US';
});

const currentPage = ref(1);
const pageSize = ref(20);
const showFilters = ref(false);
const filterChannel = ref<string>('');
const filterStatus = ref<string>('');
const searchKeyword = ref<string>('');
const selectedIds = ref<Set<string>>(new Set());
const showBatchDeleteConfirm = ref(false);
const batchDeleting = ref(false);

const { exportToJSON, exportToCSV } = useExport();

const handleExportJSON = () => {
  exportToJSON(props.history, `push-history-${new Date().toISOString().split('T')[0]}.json`);
  showToast('JSON 导出成功！', 'success');
};

const handleExportCSV = () => {
  exportToCSV(props.history, `push-history-${new Date().toISOString().split('T')[0]}.csv`);
  showToast('CSV 导出成功！', 'success');
};

const getChannelName = (channelId: string) => {
  return props.channels.find((c) => c.id === channelId)?.name || channelId;
};

const getChannelIcon = (channelId: string) => {
  return props.channels.find((c) => c.id === channelId)?.icon || '📡';
};

function formatTime(time: string): string {
  try {
    return new Date(time).toLocaleString(locale.value);
  } catch {
    return time;
  }
}

function formatLatency(ms?: number): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '全部成功';
    case 'partial':
      return '部分失败';
    case 'failed':
      return '全部失败';
    default:
      return status;
  }
}

function getRecordStatusClass(record: HistoryRecord): string {
  if (record.results.every((r: ChannelResult) => r.success)) return 'success';
  if (record.results.some((r: ChannelResult) => r.success)) return 'partial';
  return 'failed';
}

function getAvgLatency(record: HistoryRecord): string {
  const validLatencies = record.results
    .filter((r: ChannelResult) => r.latencyMs !== undefined)
    .map((r: ChannelResult) => r.latencyMs as number);

  if (validLatencies.length === 0) return '-';
  const avg =
    validLatencies.reduce((sum: number, val: number) => sum + val, 0) / validLatencies.length;
  return formatLatency(avg);
}

function getTotalRetries(record: HistoryRecord): number {
  return record.results.reduce((sum: number, r: ChannelResult) => sum + (r.retries || 0), 0);
}

const successRate = computed(() => {
  if (props.history.length === 0) return 100;
  const successCount = props.history.filter((record: HistoryRecord) =>
    record.results.every((r: ChannelResult) => r.success)
  ).length;
  return Math.round((successCount / props.history.length) * 100);
});

function resetFilters() {
  filterChannel.value = '';
  filterStatus.value = '';
  searchKeyword.value = '';
  currentPage.value = 1;
  selectedIds.value.clear();
  emit('filter-change', { channel: '', status: '', search: '' });
  emit('load-page', 1);
}

function applyFilters() {
  currentPage.value = 1;
  emit('filter-change', {
    channel: filterChannel.value || undefined,
    status: filterStatus.value || undefined,
    search: searchKeyword.value || undefined,
  });
  emit('load-page', 1);
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
}

function selectAll() {
  if (selectedIds.value.size === props.history.length) {
    selectedIds.value.clear();
  } else {
    selectedIds.value = new Set(props.history.map((r: HistoryRecord) => r.id));
  }
}

function clearSelection() {
  selectedIds.value.clear();
}

function handleResend(record: HistoryRecord) {
  emit('resend', record);
}

async function batchDeleteSelected() {
  if (selectedIds.value.size === 0 || !props.accessToken) return;

  batchDeleting.value = true;
  showBatchDeleteConfirm.value = false;

  try {
    const { batchDeleteHistory } = await import('@/api');
    const result = await batchDeleteHistory(props.accessToken, Array.from(selectedIds.value));
    showToast(result.message, 'success');
    selectedIds.value.clear();
    emit('batch-delete', Array.from(selectedIds.value));
    emit('load-page', currentPage.value);
  } catch (err: unknown) {
    showToast((err as Error).message || '批量删除失败', 'error');
  } finally {
    batchDeleting.value = false;
  }
}

const uniqueChannels = computed(() => {
  const channels = new Set<string>();
  props.history.forEach((record: HistoryRecord) => {
    record.channels.forEach((ch: string) => channels.add(ch));
  });
  return Array.from(channels);
});

const activeFilters = computed(() => {
  const count = [filterChannel.value, filterStatus.value, searchKeyword.value].filter(
    Boolean
  ).length;
  return count;
});
</script>

<template>
  <div class="tab-content">
    <div class="panel">
      <div class="panel-header">
        <h2>📜 {{ t('label.push_history') }}</h2>
        <div class="header-actions">
          <button class="btn btn-sm btn-secondary" @click="showFilters = !showFilters">
            🔍 {{ showFilters ? '收起筛选' : '筛选' }}
            <span v-if="activeFilters > 0" class="filter-badge">{{ activeFilters }}</span>
          </button>
          <button
            v-if="selectedIds.size > 0"
            class="btn btn-sm btn-warning"
            @click="showBatchDeleteConfirm = true"
          >
            🗑️ 批量删除 ({{ selectedIds.size }})
          </button>
          <button
            v-if="selectedIds.size > 0"
            class="btn btn-sm btn-secondary"
            @click="clearSelection"
          >
            取消选择
          </button>
          <div class="export-buttons">
            <button class="btn btn-sm btn-secondary" @click="handleExportCSV">📊 导出 CSV</button>
            <button class="btn btn-sm btn-secondary" @click="handleExportJSON">📋 导出 JSON</button>
          </div>
          <button class="btn btn-sm btn-danger" @click="emit('clear')">🗑️ 清空</button>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-label">总记录数</span>
          <span class="stat-value">{{ total || history.length }}</span>
        </div>
        <div class="stat-item stat-success">
          <span class="stat-label">成功率</span>
          <span class="stat-value">{{ successRate }}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">当前页</span>
          <span class="stat-value">{{ currentPage }}</span>
        </div>
      </div>

      <div v-if="showFilters" class="filter-panel">
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">关键词搜索</label>
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索标题或内容..."
              class="filter-input"
              @keyup.enter="applyFilters"
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">渠道</label>
            <select v-model="filterChannel" class="filter-select" @change="applyFilters">
              <option value="">全部渠道</option>
              <option v-for="ch in uniqueChannels" :key="ch" :value="ch">
                {{ getChannelIcon(ch) }} {{ getChannelName(ch) }}
              </option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">状态</label>
            <select v-model="filterStatus" class="filter-select" @change="applyFilters">
              <option value="">全部状态</option>
              <option value="success">全部成功</option>
              <option value="partial">部分失败</option>
              <option value="failed">全部失败</option>
            </select>
          </div>
          <button class="btn btn-sm btn-secondary" @click="resetFilters">重置</button>
        </div>
      </div>

      <div v-if="loading" class="loading-placeholder">
        <div class="loading-spinner"></div>
        <p>{{ t('label.loading') }}</p>
      </div>

      <div v-else-if="history.length === 0" class="empty">
        <div class="empty-icon">📭</div>
        <p>{{ t('label.no_history') }}</p>
      </div>

      <div v-else class="history-list-container">
        <!-- 全选按钮 -->
        <div class="select-all-bar">
          <label class="select-all-label">
            <input
              type="checkbox"
              :checked="selectedIds.size === history.length && history.length > 0"
              @change="selectAll"
            />
            <span>{{ selectedIds.size > 0 ? `已选择 ${selectedIds.size} 项` : '全选' }}</span>
          </label>
        </div>

        <div class="history-list">
          <div
            v-for="record in history"
            :key="record.id"
            class="history-item"
            :class="[getRecordStatusClass(record), { selected: selectedIds.has(record.id) }]"
          >
            <div class="history-select">
              <input
                type="checkbox"
                :checked="selectedIds.has(record.id)"
                @change="toggleSelect(record.id)"
              />
            </div>
            <div class="history-content">
              <div class="history-header">
                <div class="header-left">
                  <div class="history-title">{{ record.title }}</div>
                  <div class="history-meta">
                    <span class="meta-time">{{ formatTime(record.time) }}</span>
                    <span class="meta-status" :class="record.status">
                      {{ getStatusLabel(record.status) }}
                    </span>
                    <span class="meta-avg-latency">⏱️ 平均 {{ getAvgLatency(record) }}</span>
                    <span v-if="getTotalRetries(record) > 0" class="meta-retries">
                      🔄 重试 {{ getTotalRetries(record) }} 次
                    </span>
                  </div>
                </div>
                <div class="header-right">
                  <div class="channel-tags">
                    <span v-for="ch in record.channels" :key="ch" class="channel-tag">
                      {{ getChannelIcon(ch) }} {{ getChannelName(ch) }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="record.body" class="history-body">{{ record.body }}</div>

              <div v-if="record.url" class="history-url">
                <a :href="record.url" target="_blank" rel="noopener">{{ record.url }}</a>
              </div>

              <div class="history-actions">
                <button class="btn btn-sm btn-secondary" @click="handleResend(record)">
                  🔄 重新发送
                </button>
              </div>
              <details class="results-details">
                <summary class="results-summary">
                  <span class="summary-text">
                    查看详情 ({{ record.results.length }} 个渠道)
                  </span>
                  <span class="summary-icon">▼</span>
                </summary>
                <div class="history-results">
                  <div
                    v-for="result in record.results"
                    :key="result.channel"
                    class="history-result"
                    :class="result.success ? 'success' : 'error'"
                  >
                    <div class="result-left">
                      <span class="result-status">{{ result.success ? '✓' : '✗' }}</span>
                      <span class="result-channel">
                        {{ getChannelIcon(result.channel) }}
                        {{ getChannelName(result.channel) }}
                      </span>
                    </div>
                    <div class="result-right">
                      <span v-if="result.latencyMs !== undefined" class="result-latency">
                        ⏱️ {{ formatLatency(result.latencyMs) }}
                      </span>
                      <span v-if="result.retries && result.retries > 0" class="result-retries">
                        🔄 {{ result.retries }} 次重试
                      </span>
                    </div>
                    <span class="result-message">{{ result.message }}</span>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      <div v-if="(total || 0) > pageSize" class="pagination">
        <button
          class="btn btn-sm btn-secondary"
          :disabled="currentPage <= 1"
          @click="
            currentPage--;
            emit('load-page', currentPage);
          "
        >
          ← 上一页
        </button>
        <span class="page-info">第 {{ currentPage }} 页</span>
        <button
          class="btn btn-sm btn-secondary"
          :disabled="!(currentPage * pageSize < (total || 0))"
          @click="
            currentPage++;
            emit('load-page', currentPage);
          "
        >
          下一页 →
        </button>
      </div>
    </div>
  </div>

  <!-- 批量删除确认 -->
  <div
    v-if="showBatchDeleteConfirm"
    class="modal-overlay"
    @click.self="showBatchDeleteConfirm = false"
  >
    <div class="modal modal-small">
      <div class="modal-header">
        <h3>批量删除确认</h3>
        <button class="btn-close" @click="showBatchDeleteConfirm = false">&times;</button>
      </div>
      <div class="modal-body">
        <p>确定要删除选中的 {{ selectedIds.size }} 条推送记录吗？</p>
        <p class="modal-hint">此操作不可撤销。</p>
        <div class="form-actions">
          <button class="btn btn-secondary" @click="showBatchDeleteConfirm = false">取消</button>
          <button class="btn btn-danger" @click="batchDeleteSelected" :disabled="batchDeleting">
            {{ batchDeleting ? '删除中...' : '确定删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.panel-header h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  height: auto;
  line-height: normal;
  padding-bottom: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.export-buttons {
  display: flex;
  gap: 6px;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  background: var(--bg-secondary, #f5f5f5);
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-success {
  background: #d1fae5;
  border: 1px solid #a7f3d0;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #1a1a2e);
}

.stat-success .stat-value {
  color: #065f46;
}

.filter-panel {
  background: var(--bg-secondary, #f8f9fa);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.filter-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.filter-group {
  flex: 1;
  min-width: 180px;
}

.filter-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #666);
  margin-bottom: 4px;
}

.filter-input,
.filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  box-sizing: border-box;
}

.filter-input:focus,
.filter-select:focus {
  outline: none;
  border-color: #667eea;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: #667eea;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  margin-left: 4px;
}

.loading-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
  color: var(--text-secondary, #999);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color, #e0e0e0);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty {
  text-align: center;
  padding: 48px 32px;
  color: var(--text-secondary, #999);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.history-list-container {
  overflow-y: auto;
  border-radius: 8px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
  padding-bottom: 16px;
}

.history-item {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border-color, #eee);
  border-left: 3px solid #667eea;
  display: flex;
  box-sizing: border-box;
}

.history-item.success {
  border-left-color: #10b981;
}

.history-item.partial {
  border-left-color: #f59e0b;
}

.history-item.failed {
  border-left-color: #ef4444;
}

.history-item.selected {
  background: #eef0ff;
  border-left-color: #667eea;
}

.select-all-bar {
  padding: 8px 12px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 6px;
  margin-bottom: 8px;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.history-select {
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.history-select input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.history-content {
  flex: 1;
  min-width: 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-panel, white);
  border-radius: 12px;
  width: 90%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  padding: 0;
  line-height: 1;
}

.modal-body {
  padding: 20px;
}

.modal-hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin: 8px 0 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #f0f0f0);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  height: 34px;
  box-sizing: border-box;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  height: 30px;
}

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color, #e0e0e0);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff7875;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-warning:hover {
  background: #d97706;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.header-right {
  flex-shrink: 0;
}

.history-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 4px;
}

.history-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.meta-time {
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.meta-status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.meta-status.success {
  background: #d1fae5;
  color: #065f46;
}

.meta-status.partial {
  background: #fef3c7;
  color: #92400e;
}

.meta-status.failed {
  background: #fee2e2;
  color: #991b1b;
}

.meta-avg-latency,
.meta-retries {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.channel-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.channel-tag {
  font-size: 11px;
  padding: 4px 8px;
  background: var(--bg-panel, white);
  border-radius: 4px;
  color: var(--text-primary, #333);
  white-space: nowrap;
}

.history-body {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin-bottom: 8px;
  line-height: 1.5;
}

.history-url {
  font-size: 12px;
  margin-bottom: 8px;
}

.history-url a {
  color: #667eea;
  text-decoration: none;
}

.history-url a:hover {
  text-decoration: underline;
}

.history-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.results-details {
  margin-top: 8px;
  border-top: 1px solid var(--border-color, #e0e0e0);
  padding-top: 8px;
}

.results-summary {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary, #666);
  padding: 4px 0;
}

.results-summary:hover {
  color: var(--text-primary, #333);
}

.summary-icon {
  transition: transform 0.2s;
}

.results-details[open] .summary-icon {
  transform: rotate(180deg);
}

.history-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.history-result {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  flex-wrap: wrap;
}

.history-result.success {
  background: #d4edda;
  color: #155724;
}

.history-result.error {
  background: #f8d7da;
  color: #721c24;
}

.result-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.result-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.result-status {
  font-weight: bold;
}

.result-channel {
  font-weight: 500;
  min-width: 80px;
}

.result-latency,
.result-retries {
  font-size: 11px;
  color: inherit;
  opacity: 0.8;
}

.result-message {
  width: 100%;
  color: inherit;
  opacity: 0.9;
  margin-top: 2px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  height: 34px;
  box-sizing: border-box;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  height: 30px;
}

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color, #e0e0e0);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.btn-danger:hover {
  background: #fecaca;
}

@media (max-width: 768px) {
  .history-list-container {
    padding-bottom: calc(48px + env(safe-area-inset-bottom));
  }

  .panel {
    padding: 16px;
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .header-actions .btn {
    flex: 1;
    min-width: 80px;
  }

  .stats-bar {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .filter-row {
    flex-direction: column;
  }

  .filter-group {
    min-width: 100%;
  }

  .select-all-bar {
    padding: 6px 10px;
  }

  .history-item {
    padding: 12px;
  }

  .history-header {
    flex-direction: column;
    gap: 8px;
  }

  .header-right {
    width: 100%;
  }

  .channel-tags {
    flex-wrap: wrap;
  }

  .channel-tag {
    font-size: 10px;
    padding: 3px 6px;
  }

  .history-meta {
    gap: 8px;
    flex-wrap: wrap;
  }

  .history-result {
    flex-direction: column;
    padding: 8px;
  }

  .result-right {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }

  .pagination {
    flex-direction: column;
    gap: 8px;
  }

  .modal {
    width: 95%;
    margin: 16px;
  }

  .modal-header {
    padding: 12px 16px;
  }

  .modal-body {
    padding: 16px;
  }

  .form-actions {
    flex-direction: column;
    gap: 8px;
  }

  .form-actions .btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .stat-item {
    padding: 10px 12px;
  }

  .stat-value {
    font-size: 18px;
  }

  .stat-label {
    font-size: 11px;
  }

  .history-title {
    font-size: 14px;
  }

  .history-body {
    font-size: 12px;
  }

  .channel-tag {
    font-size: 9px;
    padding: 2px 5px;
  }

  .btn-sm {
    padding: 5px 10px;
    font-size: 11px;
  }

  .meta-time,
  .meta-status,
  .meta-avg-latency,
  .meta-retries {
    font-size: 10px;
  }

  .history-result {
    padding: 6px;
    font-size: 11px;
  }

  .result-channel {
    min-width: 60px;
    font-size: 11px;
  }
}
</style>
