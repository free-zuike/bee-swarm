<template>
  <div class="audit-logs">
    <div class="panel-header">
      <div class="header-actions">
        <button class="btn btn-secondary btn-sm" @click="clearFilters">
          {{ t('button.reset') }}
        </button>
        <button class="btn btn-danger btn-sm" @click="confirmClearLogs" :disabled="loading">
          {{ t('audit.clearAll') }}
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <label>{{ t('audit.action') }}</label>
        <select v-model="filterAction" class="filter-select">
          <option value="">{{ t('label.all') }}</option>
          <option value="login">{{ t('audit.login') }}</option>
          <option value="register">{{ t('audit.register') }}</option>
          <option value="user_created">{{ t('audit.userCreated') }}</option>
          <option value="user_deleted">{{ t('audit.userDeleted') }}</option>
          <option value="user_role_updated">{{ t('audit.userRoleUpdated') }}</option>
          <option value="user_disabled">{{ t('audit.userDisabled') }}</option>
          <option value="user_enabled">{{ t('audit.userEnabled') }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>{{ t('audit.startDate') }}</label>
        <input v-model="filterStartDate" type="date" class="filter-input" />
      </div>
      <div class="filter-group">
        <label>{{ t('audit.endDate') }}</label>
        <input v-model="filterEndDate" type="date" class="filter-input" />
      </div>
      <button class="btn btn-primary btn-sm" @click="loadLogs">
        {{ t('button.search') }}
      </button>
    </div>

    <div class="log-content">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('label.loading') }}</span>
      </div>

      <div v-else-if="logs.length === 0" class="empty-state">
        <div class="empty-icon"></div>
        <p>{{ t('audit.empty') }}</p>
      </div>

      <div v-else class="log-list">
        <div v-for="log in logs" :key="log.id" class="log-card">
          <div class="log-avatar">
            <span class="avatar-initial">{{ getInitial(log.userId) }}</span>
          </div>
          <div class="log-main">
            <div class="log-header">
              <span :class="['log-action', `log-action-${log.action}`]">
                {{ getActionName(log.action) }}
              </span>
              <span class="log-user">{{ log.userId }}</span>
              <span class="log-time">{{ formatTime(log.timestamp || log.created_at) }}</span>
            </div>
            <div v-if="log.metadata && Object.keys(log.metadata).length > 0" class="log-meta">
              <pre>{{ JSON.stringify(log.metadata, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 清除日志确认弹窗 -->
    <div v-if="showClearModal" class="modal-overlay" @click.self="closeClearModal">
      <div class="modal modal-danger">
        <div class="modal-header">
          <h3>{{ t('audit.clearAllConfirm') }}</h3>
          <button class="modal-close" @click="closeClearModal">✕</button>
        </div>
        <div class="modal-body">
          <p>{{ t('audit.clearAllWarning') }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeClearModal" :disabled="saving">
            {{ t('button.cancel') }}
          </button>
          <button class="btn btn-danger" @click="clearLogs" :disabled="saving">
            {{ saving ? t('label.processing') : t('audit.clearAll') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/stores/auth';
import { getAuditLogs, clearAuditLogs } from '@/api';

const t = useTranslation();
const authStore = useAuth();

const loading = ref(false);
const saving = ref(false);
const logs = ref<any[]>([]);
const filterAction = ref('');
const filterStartDate = ref('');
const filterEndDate = ref('');
const showClearModal = ref(false);

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return date.toLocaleString();
};

const getActionName = (action: string) => {
  const actionNames: Record<string, string> = {
    login: t('audit.login'),
    register: t('audit.register'),
    user_created: t('audit.userCreated'),
    user_deleted: t('audit.userDeleted'),
    user_role_updated: t('audit.userRoleUpdated'),
    user_disabled: t('audit.userDisabled'),
    user_enabled: t('audit.userEnabled'),
  };
  return actionNames[action] || action;
};

const getInitial = (str: string) => {
  if (!str) return '?';
  return str.charAt(0).toUpperCase();
};

const loadLogs = async () => {
  loading.value = true;
  try {
    const data = await getAuditLogs(authStore.accessToken, {
      action: filterAction.value || undefined,
      startDate: filterStartDate.value || undefined,
      endDate: filterEndDate.value || undefined,
    });
    logs.value = data.logs;
  } catch (err: unknown) {
    console.error('加载审计日志失败:', err);
  } finally {
    loading.value = false;
  }
};

const clearFilters = () => {
  filterAction.value = '';
  filterStartDate.value = '';
  filterEndDate.value = '';
  loadLogs();
};

const confirmClearLogs = () => {
  showClearModal.value = true;
};

const closeClearModal = () => {
  showClearModal.value = false;
};

const clearLogs = async () => {
  saving.value = true;
  try {
    await clearAuditLogs(authStore.accessToken);
    await loadLogs();
    closeClearModal();
  } catch (err: unknown) {
    console.error('清除审计日志失败:', err);
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadLogs();
});
</script>

<style scoped>
.audit-logs {
  width: 100%;
}

.panel {
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.filter-select,
.filter-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg-primary, white);
  color: var(--text-primary, #111827);
}

.log-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  max-height: calc(100vh - 220px);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 12px;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-card {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #f3f4f6);
  transition: background 0.2s;
}

.log-card:hover {
  background: var(--bg-secondary, #f9fafb);
}

.log-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-initial {
  color: white;
  font-weight: 600;
  font-size: 16px;
}

.log-main {
  flex: 1;
  min-width: 0;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.log-action {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.log-action-login {
  background: #dbeafe;
  color: #1e40af;
}

.log-action-register {
  background: #dcfce7;
  color: #166534;
}

.log-action-user_created {
  background: #dcfce7;
  color: #166534;
}

.log-action-user_deleted {
  background: #fee2e2;
  color: #991b1b;
}

.log-action-user_role_updated {
  background: #fef3c7;
  color: #92400e;
}

.log-action-user_disabled {
  background: #fee2e2;
  color: #991b1b;
}

.log-action-user_enabled {
  background: #dcfce7;
  color: #166534;
}

.log-user {
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.log-time {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-left: auto;
}

.log-meta {
  background: var(--bg-secondary, #f3f4f6);
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 8px;
}

.log-meta pre {
  margin: 0;
  font-size: 12px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary, #4b5563);
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

.modal {
  background: var(--bg-primary, white);
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 90%;
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-danger {
  border: 2px solid #fee2e2;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  line-height: 1;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.modal-close:hover {
  background: var(--bg-secondary, #f3f4f6);
}

.modal-body {
  padding: 20px;
}

.modal-body p {
  margin: 0;
  color: var(--text-secondary, #6b7280);
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary-color, #6366f1);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.btn-secondary {
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-primary, #111827);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color, #e5e7eb);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}
</style>
