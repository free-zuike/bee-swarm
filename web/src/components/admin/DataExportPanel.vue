<template>
  <div class="data-export-panel" :class="{ dark: isDark }">
    <div class="panel">
      <div class="panel-header">
        <h2>📥 {{ t('label.dataExport') || '数据导出' }}</h2>
      </div>

      <div class="export-form">
        <div class="form-group">
          <label>{{ t('label.exportFormat') || '导出格式' }}</label>
          <div class="format-options">
            <label class="format-option">
              <input type="radio" v-model="format" value="json" />
              <span class="format-label">JSON</span>
            </label>
            <label class="format-option">
              <input type="radio" v-model="format" value="csv" />
              <span class="format-label">CSV</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>{{ t('label.timeRange') || '时间范围' }}</label>
          <div class="date-range">
            <input v-model="dateStart" type="date" class="date-input" />
            <span class="date-separator">-</span>
            <input v-model="dateEnd" type="date" class="date-input" />
          </div>
          <p class="field-hint">{{ t('label.timeRangeHint') || '留空则导出全部数据' }}</p>
        </div>

        <div class="form-group">
          <button class="btn btn-primary btn-export" @click="handleExport" :disabled="exporting">
            {{ exporting ? t('label.exporting') || '导出中...' : t('label.export') || '导出数据' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import { useThemeStore } from '@/stores/theme';
import { useGlobalToast } from '@/composables/useToast';
import { exportData } from '@/api';

const { showToast } = useGlobalToast();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const props = defineProps<{
  accessToken: string;
}>();

const format = ref<'json' | 'csv'>('json');
const dateStart = ref('');
const dateEnd = ref('');
const exporting = ref(false);

async function handleExport() {
  if (!props.accessToken) return;
  exporting.value = true;
  try {
    const options: Parameters<typeof exportData>[1] = { format: format.value };
    if (dateStart.value || dateEnd.value) {
      options.dateRange = {
        start: dateStart.value ? `${dateStart.value}T00:00:00` : '',
        end: dateEnd.value ? `${dateEnd.value}T23:59:59` : '',
      };
    }
    await exportData(props.accessToken, options);
    showToast(t('message.export_success') || '导出成功', 'success');
  } catch (err) {
    showToast((err as Error).message || t('message.export_failed') || '导出失败', 'error');
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.data-export-panel {
  padding: 0;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.panel-header {
  height: auto;
  min-height: 50px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.export-form {
  max-width: 480px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary, #333);
  font-size: 14px;
}

.format-options {
  display: flex;
  gap: 16px;
}

.format-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.format-option:has(input:checked) {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.format-option input {
  margin: 0;
}

.format-label {
  font-size: 14px;
  font-weight: 500;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 12px;
}

.date-input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-panel, white);
}

.date-input:focus {
  outline: none;
  border-color: #667eea;
}

.date-separator {
  color: #999;
  font-weight: 500;
}

.field-hint {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin: 6px 0 0;
}

.btn-export {
  width: 100%;
  padding: 12px 24px;
  font-size: 15px;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.data-export-panel.dark .panel {
  background: #1e1e2e;
}

.data-export-panel.dark .panel-header {
  border-bottom-color: #313244;
}

.data-export-panel.dark .panel h2 {
  color: #cdd6f4;
}

.data-export-panel.dark .form-group label {
  color: #cdd6f4;
}

.data-export-panel.dark .format-option {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.data-export-panel.dark .format-option:has(input:checked) {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.data-export-panel.dark .date-input {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.data-export-panel.dark .field-hint {
  color: #6c7086;
}
</style>
