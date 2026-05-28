<script setup lang="ts">
import { computed } from 'vue';
import { t } from '@/i18n';
import type { ChannelConfig } from '@/types';

interface HistoryRecord {
  title: string;
  body?: string;
  url?: string;
  time: string;
  results: Array<{
    channel: string;
    success: boolean;
    message: string;
  }>;
}

const props = defineProps<{
  history: HistoryRecord[];
  loading?: boolean;
  channels: ChannelConfig[];
}>();

const locale = computed(() => {
  const lang = localStorage.getItem('bee_swarm_locale') || 'zh';
  return lang === 'zh' ? 'zh-CN' : 'en-US';
});
</script>

<template>
  <div class="tab-content">
    <div class="panel">
      <h2>📜 {{ t('label.push_history') }}</h2>

      <div v-if="loading" class="loading-placeholder">
        <div class="loading-spinner"></div>
        <p>{{ t('label.loading') }}</p>
      </div>

      <div v-else-if="history.length === 0" class="empty">
        <p>{{ t('label.no_history') }}</p>
      </div>

      <div v-else class="history-list">
        <div
          v-for="(record, index) in history"
          :key="index"
          class="history-item"
        >
          <div class="history-header">
            <div class="history-title">{{ record.title }}</div>
            <div class="history-time">{{ new Date(record.time).toLocaleString(locale) }}</div>
          </div>
          <div v-if="record.body" class="history-body">{{ record.body }}</div>
          <div v-if="record.url" class="history-url">
            <a :href="record.url" target="_blank" rel="noopener">{{ record.url }}</a>
          </div>
          <div class="history-results">
            <div
              v-for="result in record.results"
              :key="result.channel"
              class="history-result"
              :class="result.success ? 'success' : 'error'"
            >
              <span class="result-status">{{ result.success ? '✓' : '✗' }}</span>
              <span class="result-channel">{{ channels.find((c) => c.id === result.channel)?.icon || '' }} {{ channels.find((c) => c.id === result.channel)?.name || result.channel }}</span>
              <span class="result-message">{{ result.message }}</span>
            </div>
          </div>
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
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
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
  to { transform: rotate(360deg); }
}

.empty {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary, #999);
  font-size: 14px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 600px;
  overflow-y: auto;
}

.history-item {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border-color, #eee);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary, #1a1a2e);
}

.history-time {
  font-size: 12px;
  color: var(--text-secondary, #999);
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

.history-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.history-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
}

.history-result.success {
  background: #d4edda;
  color: #155724;
}

.history-result.error {
  background: #f8d7da;
  color: #721c24;
}

.result-status {
  font-weight: bold;
}

.result-channel {
  font-weight: 500;
  min-width: 80px;
}

.result-message {
  color: inherit;
  opacity: 0.9;
}
</style>
