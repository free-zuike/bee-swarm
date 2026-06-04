<template>
  <div class="audit-logs">
    <div class="panel">
      <div class="panel-header">
        <h2>📋 {{ t('audit.title') }}</h2>
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
  max-height: calc(100vh - 200px);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filter-bar {
  display: flex;
  gap: 16px;
  padding: 20px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 160px;
}

.filter-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.filter-input,
.filter-select {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: all 0.2s;
}

.filter-input:focus,
.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  gap: 16px;
  color: var(--text-secondary);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 64px;
  opacity: 0.3;
}

.log-content {
  overflow-y: auto;
  flex: 1;
}

.log-list {
  padding: 24px;
  display: grid;
  gap: 12px;
}

.log-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
}

.log-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.log-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.12);
  transform: translateY(-1px);
}

.log-card:hover::before {
  opacity: 1;
}

.log-avatar {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.25);
  flex-shrink: 0;
}

.avatar-initial {
  color: white;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.log-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.log-action {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.log-action-login {
  background: #dbeafe;
  color: #1d4ed8;
}

.log-action-register {
  background: #d1fae5;
  color: #047857;
}

.log-action-user_created {
  background: #ede9fe;
  color: #4f46e5;
}

.log-action-user_deleted {
  background: #fee2e2;
  color: #dc2626;
}

.log-action-user_role_updated {
  background: #fef3c7;
  color: #b45309;
}

.log-action-user_disabled {
  background: #fee2e2;
  color: #b91c1c;
}

.log-action-user_enabled {
  background: #d1fae5;
  color: #047857;
}

.log-action-push_sent {
  background: #d1fae5;
  color: #047857;
}

.log-action-push_failed {
  background: #fee2e2;
  color: #dc2626;
}

.log-action-channel_updated {
  background: #dbeafe;
  color: #1d4ed8;
}

.log-action-channel_deleted {
  background: #fee2e2;
  color: #dc2626;
}

.log-action-template_created {
  background: #ede9fe;
  color: #4f46e5;
}

.log-action-template_updated {
  background: #dbeafe;
  color: #1d4ed8;
}

.log-action-template_deleted {
  background: #fee2e2;
  color: #dc2626;
}

.log-action-scheduled_push_created {
  background: #ede9fe;
  color: #4f46e5;
}

.log-action-scheduled_push_cancelled {
  background: #fef3c7;
  color: #b45309;
}

.log-action-scheduled_push_rescheduled {
  background: #dbeafe;
  color: #1d4ed8;
}

.log-action-logout {
  background: #f3f4f6;
  color: #4b5563;
}

.log-action-backup_created {
  background: #d1fae5;
  color: #047857;
}

.log-action-backup_restored {
  background: #dbeafe;
  color: #1d4ed8;
}

.log-action-settings_updated {
  background: #dbeafe;
  color: #1d4ed8;
}

.log-user {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.log-user::before {
  content: '@';
  color: var(--text-secondary);
  font-weight: 400;
  font-size: 12px;
}

.log-time {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.log-meta {
  background: var(--bg-primary);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-top: 4px;
  overflow-x: auto;
}

.log-meta pre {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
  line-height: 1.5;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  line-height: 1;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
  }
}
</style>
