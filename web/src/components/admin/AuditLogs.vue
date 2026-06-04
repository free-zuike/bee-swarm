
&lt;template&gt;
  &lt;div class="audit-logs"&gt;
    &lt;div class="panel-header"&gt;
      &lt;div class="header-actions"&gt;
        &lt;button class="btn btn-secondary btn-sm" @click="clearFilters"&gt;
          {{ t('button.reset') }}
        &lt;/button&gt;
        &lt;button class="btn btn-danger btn-sm" @click="confirmClearLogs" :disabled="loading"&gt;
          {{ t('audit.clearAll') }}
        &lt;/button&gt;
      &lt;/div&gt;
    &lt;/div&gt;

    &lt;div class="filter-bar"&gt;
      &lt;div class="filter-group"&gt;
        &lt;label&gt;{{ t('audit.action') }}&lt;/label&gt;
        &lt;select v-model="filterAction" class="filter-select"&gt;
          &lt;option value=""&gt;{{ t('label.all') }}&lt;/option&gt;
          &lt;option value="login"&gt;{{ t('audit.login') }}&lt;/option&gt;
          &lt;option value="register"&gt;{{ t('audit.register') }}&lt;/option&gt;
          &lt;option value="user_created"&gt;{{ t('audit.userCreated') }}&lt;/option&gt;
          &lt;option value="user_deleted"&gt;{{ t('audit.userDeleted') }}&lt;/option&gt;
          &lt;option value="user_role_updated"&gt;{{ t('audit.userRoleUpdated') }}&lt;/option&gt;
          &lt;option value="user_disabled"&gt;{{ t('audit.userDisabled') }}&lt;/option&gt;
          &lt;option value="user_enabled"&gt;{{ t('audit.userEnabled') }}&lt;/option&gt;
        &lt;/select&gt;
      &lt;/div&gt;
      &lt;div class="filter-group"&gt;
        &lt;label&gt;{{ t('audit.startDate') }}&lt;/label&gt;
        &lt;input v-model="filterStartDate" type="date" class="filter-input" /&gt;
      &lt;/div&gt;
      &lt;div class="filter-group"&gt;
        &lt;label&gt;{{ t('audit.endDate') }}&lt;/label&gt;
        &lt;input v-model="filterEndDate" type="date" class="filter-input" /&gt;
      &lt;/div&gt;
      &lt;button class="btn btn-primary btn-sm" @click="loadLogs"&gt;
        {{ t('button.search') }}
      &lt;/button&gt;
    &lt;/div&gt;

    &lt;div class="log-content"&gt;
      &lt;div v-if="loading" class="loading-state"&gt;
        &lt;div class="spinner"&gt;&lt;/div&gt;
        &lt;span&gt;{{ t('label.loading') }}&lt;/span&gt;
      &lt;/div&gt;

      &lt;div v-else-if="logs.length === 0" class="empty-state"&gt;
        &lt;div class="empty-icon"&gt;&lt;/div&gt;
        &lt;p&gt;{{ t('audit.empty') }}&lt;/p&gt;
      &lt;/div&gt;

      &lt;div v-else class="log-list"&gt;
        &lt;div v-for="log in logs" :key="log.id" class="log-card"&gt;
          &lt;div class="log-avatar"&gt;
            &lt;span class="avatar-initial"&gt;{{ getInitial(log.userId) }}&lt;/span&gt;
          &lt;/div&gt;
          &lt;div class="log-main"&gt;
            &lt;div class="log-header"&gt;
              &lt;span :class="['log-action', `log-action-${log.action}`]"&gt;
                {{ getActionName(log.action) }}
              &lt;/span&gt;
              &lt;span class="log-user"&gt;{{ log.userId }}&lt;/span&gt;
              &lt;span class="log-time"&gt;{{ formatTime(log.timestamp || log.created_at) }}&lt;/span&gt;
            &lt;/div&gt;
            &lt;div v-if="log.metadata &amp;&amp; Object.keys(log.metadata).length &gt; 0" class="log-meta"&gt;
              &lt;pre&gt;{{ JSON.stringify(log.metadata, null, 2) }}&lt;/pre&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;

    &lt;!-- 清除日志确认弹窗 --&gt;
    &lt;div v-if="showClearModal" class="modal-overlay" @click.self="closeClearModal"&gt;
      &lt;div class="modal modal-danger"&gt;
        &lt;div class="modal-header"&gt;
          &lt;h3&gt;{{ t('audit.clearAllConfirm') }}&lt;/h3&gt;
          &lt;button class="modal-close" @click="closeClearModal"&gt;✕&lt;/button&gt;
        &lt;/div&gt;
        &lt;div class="modal-body"&gt;
          &lt;p&gt;{{ t('audit.clearAllWarning') }}&lt;/p&gt;
        &lt;/div&gt;
        &lt;div class="modal-footer"&gt;
          &lt;button class="btn btn-secondary" @click="closeClearModal" :disabled="saving"&gt;
            {{ t('button.cancel') }}
          &lt;/button&gt;
          &lt;button class="btn btn-danger" @click="clearLogs" :disabled="saving"&gt;
            {{ saving ? t('label.processing') : t('audit.clearAll') }}
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/template&gt;

&lt;script setup lang="ts"&gt;
import { ref, onMounted } from 'vue';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/stores/auth';
import { getAuditLogs, clearAuditLogs } from '@/api';

const t = useTranslation();
const authStore = useAuth();

const loading = ref(false);
const saving = ref(false);
const logs = ref&lt;any[]&gt;([]);
const filterAction = ref('');
const filterStartDate = ref('');
const filterEndDate = ref('');
const showClearModal = ref(false);

const formatTime = (timeStr: string) =&gt; {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return date.toLocaleString();
};

const getActionName = (action: string) =&gt; {
  const actionNames: Record&lt;string, string&gt; = {
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

const getInitial = (str: string) =&gt; {
  if (!str) return '?';
  return str.charAt(0).toUpperCase();
};

const loadLogs = async () =&gt; {
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

const clearFilters = () =&gt; {
  filterAction.value = '';
  filterStartDate.value = '';
  filterEndDate.value = '';
  loadLogs();
};

const confirmClearLogs = () =&gt; {
  showClearModal.value = true;
};

const closeClearModal = () =&gt; {
  showClearModal.value = false;
};

const clearLogs = async () =&gt; {
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

onMounted(() =&gt; {
  loadLogs();
});
&lt;/script&gt;

&lt;style scoped&gt;
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
  max-height: 500px;
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
&lt;/style&gt;

