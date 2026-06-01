<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { getAuditLogs, clearAuditLogs, type AuditLog } from '@/api';
const t = useTranslation();
const { showToast } = useGlobalToast();

const logs = ref<AuditLog[]>([]);
const loading = ref(true);
const showClearConfirm = ref(false);
const filterAction = ref('');
const startDate = ref('');
const endDate = ref('');

const ACTION_LABELS: Record<string, string> = {
  login: t('audit.action.login'),
  register: t('audit.action.register'),
  push_sent: t('audit.action.push_sent'),
  push_failed: t('audit.action.push_failed'),
  channel_updated: t('audit.action.channel_updated'),
  channel_deleted: t('audit.action.channel_deleted'),
  user_created: t('audit.action.user_created'),
  user_deleted: t('audit.action.user_deleted'),
  user_role_updated: t('audit.action.user_role_updated'),
  user_disabled: t('audit.action.user_disabled'),
  user_enabled: t('audit.action.user_enabled'),
  template_created: t('audit.action.template_created'),
  template_updated: t('audit.action.template_updated'),
  template_deleted: t('audit.action.template_deleted'),
};

const filteredLogs = computed(() => {
  let result = logs.value;
  
  if (filterAction.value) {
    result = result.filter((log) => log.action === filterAction.value);
  }
  
  if (startDate.value) {
    const start = new Date(startDate.value);
    result = result.filter((log) => new Date(log.timestamp) >= start);
  }
  
  if (endDate.value) {
    const end = new Date(endDate.value);
    end.setDate(end.getDate() + 1);
    result = result.filter((log) => new Date(log.timestamp) < end);
  }
  
  return result;
});

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  const display: string[] = [];
  if (metadata.email) display.push(`Email: ${metadata.email}`);
  if (metadata.role) display.push(`Role: ${metadata.role}`);
  if (metadata.reason) display.push(`Reason: ${metadata.reason}`);
  if (metadata.channelId) display.push(`Channel: ${metadata.channelId}`);
  if (metadata.channels) display.push(`Channels: ${metadata.channels}`);
  if (metadata.successCount) display.push(`Success: ${metadata.successCount}`);
  if (metadata.failedCount) display.push(`Failed: ${metadata.failedCount}`);
  if (metadata.targetUserId) display.push(`Target: ${metadata.targetUserId}`);
  if (metadata.newRole) display.push(`New Role: ${metadata.newRole}`);
  return display.join(', ') || '-';
}

async function loadLogs() {
  loading.value = true;
  const token = localStorage.getItem('bee_swarm_token');
  if (!token) return;
  
  try {
    logs.value = await getAuditLogs(token, {
      limit: 100,
      action: filterAction.value || undefined,
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
    });
  } catch (err) {
    showToast((err as Error).message || t('message.load_failed'), 'error');
  } finally {
    loading.value = false;
  }
}

async function handleClearLogs() {
  const token = localStorage.getItem('bee_swarm_token');
  if (!token) return;
  
  try {
    await clearAuditLogs(token);
    logs.value = [];
    showToast(t('message.audit_logs_cleared'), 'success');
  } catch (err) {
    showToast((err as Error).message || t('message.clear_failed'), 'error');
  }
  showClearConfirm.value = false;
}

function applyFilters() {
  loadLogs();
}

function resetFilters() {
  filterAction.value = '';
  startDate.value = '';
  endDate.value = '';
  loadLogs();
}

onMounted(loadLogs);
</script>

<template>
  <div class="audit-logs-container">
    <div class="audit-header">
      <div class="audit-title">
        <h3>{{ t('label.audit_logs') }}</h3>
        <span class="log-count">{{ t('label.total') }}: {{ filteredLogs.length }}</span>
      </div>
      <button
        class="btn btn-danger"
        @click="showClearConfirm = true"
        :disabled="logs.length === 0"
      >
        {{ t('button.clear_all') }}
      </button>
    </div>

    <div class="filter-bar">
      <select
        v-model="filterAction"
        class="filter-select"
        @change="applyFilters"
      >
        <option value="">{{ t('label.filter_by_action') }}</option>
        <option value="login">{{ t('audit.action.login') }}</option>
        <option value="register">{{ t('audit.action.register') }}</option>
        <option value="push_sent">{{ t('audit.action.push_sent') }}</option>
        <option value="push_failed">{{ t('audit.action.push_failed') }}</option>
        <option value="channel_updated">{{ t('audit.action.channel_updated') }}</option>
        <option value="channel_deleted">{{ t('audit.action.channel_deleted') }}</option>
        <option value="user_created">{{ t('audit.action.user_created') }}</option>
        <option value="user_deleted">{{ t('audit.action.user_deleted') }}</option>
        <option value="user_role_updated">{{ t('audit.action.user_role_updated') }}</option>
        <option value="user_disabled">{{ t('audit.action.user_disabled') }}</option>
        <option value="user_enabled">{{ t('audit.action.user_enabled') }}</option>
        <option value="template_created">{{ t('audit.action.template_created') }}</option>
        <option value="template_updated">{{ t('audit.action.template_updated') }}</option>
        <option value="template_deleted">{{ t('audit.action.template_deleted') }}</option>
      </select>
      <input
        v-model="startDate"
        type="date"
        class="filter-input"
        :placeholder="t('label.start_date')"
        @change="applyFilters"
      />
      <input
        v-model="endDate"
        type="date"
        class="filter-input"
        :placeholder="t('label.end_date')"
        @change="applyFilters"
      />
      <button class="btn btn-secondary" @click="resetFilters">
        {{ t('button.reset') }}
      </button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>{{ t('label.loading') }}</span>
    </div>

    <div v-else-if="filteredLogs.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <p>{{ t('label.no_audit_logs') }}</p>
    </div>

    <div v-else class="logs-table">
      <table>
        <thead>
          <tr>
            <th>{{ t('label.time') }}</th>
            <th>{{ t('label.action') }}</th>
            <th>{{ t('label.user') }}</th>
            <th>{{ t('label.details') }}</th>
            <th>{{ t('label.ip') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in filteredLogs" :key="log.id">
            <td>{{ formatTimestamp(log.timestamp) }}</td>
            <td><span class="action-tag">{{ getActionLabel(log.action) }}</span></td>
            <td>{{ log.userId }}</td>
            <td class="details-cell">{{ formatMetadata(log.metadata) }}</td>
            <td>{{ log.ip || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showClearConfirm" class="modal-overlay" @click.self="showClearConfirm = false">
      <div class="modal-content">
        <h4>{{ t('label.confirm_clear') }}</h4>
        <p>{{ t('message.confirm_clear_audit') }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showClearConfirm = false">
            {{ t('button.cancel') }}
          </button>
          <button class="btn btn-danger" @click="handleClearLogs">
            {{ t('button.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit-logs-container {
  padding: 20px;
}

.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.audit-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audit-title h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
}

.log-count {
  font-size: 14px;
  color: var(--text-secondary, #999);
  background: var(--bg-secondary, #f5f5f5);
  padding: 4px 12px;
  border-radius: 20px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-select {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
}

.filter-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary {
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-primary, #1a1a2e);
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c0392b;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color, #e0e0e0);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, #999);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.logs-table {
  overflow-x: auto;
}

.logs-table table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-panel, white);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.logs-table th,
.logs-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.logs-table th {
  background: var(--bg-secondary, #f5f5f5);
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  font-size: 13px;
}

.logs-table tbody tr:hover {
  background: var(--bg-secondary, #f5f5f5);
}

.action-tag {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #e8f5e9;
  color: #2e7d32;
}

.details-cell {
  font-size: 13px;
  color: var(--text-secondary, #999);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  width: 360px;
  text-align: center;
}

.modal-content h4 {
  margin: 0 0 12px 0;
  color: var(--text-primary, #1a1a2e);
}

.modal-content p {
  color: var(--text-secondary, #999);
  margin: 0 0 20px 0;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
  }
  
  .filter-select,
  .filter-input {
    width: 100%;
  }
  
  .logs-table {
    font-size: 12px;
  }
  
  .logs-table th,
  .logs-table td {
    padding: 8px 10px;
  }
  
  .details-cell {
    max-width: 150px;
  }
  
  .modal-content {
    width: 90%;
    padding: 20px;
  }
}
</style>