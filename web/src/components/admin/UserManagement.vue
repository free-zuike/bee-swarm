<template>
  <div class="user-management">
    <div class="panel">
      <div class="panel-header">
        <h2>👥 {{ t('label.user_management') }}</h2>
        <button class="btn btn-primary" @click="showAddUserModal = true">
          + {{ t('label.add_user') }}
        </button>
      </div>

      <div v-if="loading" class="loading-placeholder">
        <div class="loading-spinner"></div>
        <p>{{ t('label.loading') }}</p>
      </div>

      <div v-else-if="users.length === 0" class="empty">
        <div class="empty-icon">👤</div>
        <p>{{ t('label.no_users') }}</p>
      </div>

      <div v-else class="user-list">
        <div v-if="selectedUsers.length > 0" class="batch-actions">
          <span>{{ t('label.selected') }}: {{ selectedUsers.length }}</span>
          <select v-model="batchRole" class="batch-role-select">
            <option value="">{{ t('label.batch_change_role') }}</option>
            <option value="viewer">{{ t('role.viewer') }}</option>
            <option value="user">{{ t('role.user') }}</option>
            <option value="admin">{{ t('role.admin') }}</option>
          </select>
          <button
            class="btn btn-sm btn-secondary"
            @click="batchUpdateRole"
            :disabled="!batchRole"
          >
            {{ t('button.apply') }}
          </button>
          <button class="btn btn-sm btn-danger" @click="confirmBatchDelete">
            {{ t('button.batch_delete') }}
          </button>
          <button class="btn btn-sm btn-secondary" @click="clearSelection">
            {{ t('button.clear') }}
          </button>
        </div>

        <table class="user-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  :checked="allSelected"
                  @change="toggleSelectAll"
                  class="select-all"
                />
              </th>
              <th>{{ t('label.email') }}</th>
              <th>{{ t('label.role') }}</th>
              <th>{{ t('label.status') }}</th>
              <th>{{ t('label.created_at') }}</th>
              <th>{{ t('label.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <input
                  type="checkbox"
                  :checked="selectedUsers.includes(user.id)"
                  @change="toggleSelect(user.id)"
                  :disabled="user.id === currentUserId"
                  class="select-row"
                />
              </td>
              <td>{{ user.email }}</td>
              <td>
                <select
                  v-model="editingRole[user.id]"
                  @change="updateUserRole(user.id)"
                  :disabled="user.id === currentUserId"
                  class="role-select"
                >
                  <option value="viewer">{{ t('role.viewer') }}</option>
                  <option value="user">{{ t('role.user') }}</option>
                  <option value="admin">{{ t('role.admin') }}</option>
                </select>
              </td>
              <td>
                <span :class="['status-badge', user.disabled ? 'disabled' : 'active']">
                  {{ user.disabled ? t('label.disabled') : t('label.active') }}
                </span>
              </td>
              <td>{{ formatDate(user.created_at) }}</td>
              <td>
                <button
                  v-if="!user.disabled"
                  class="btn btn-sm btn-warning"
                  @click="confirmDisableUser(user)"
                  :disabled="user.id === currentUserId"
                >
                  {{ t('label.disable') }}
                </button>
                <button
                  v-else
                  class="btn btn-sm btn-success"
                  @click="enableUser(user.id)"
                >
                  {{ t('label.enable') }}
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  @click="confirmDeleteUser(user)"
                  :disabled="user.id === currentUserId"
                >
                  {{ t('label.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 添加用户模态框 -->
    <div
      v-if="showAddUserModal"
      class="modal-overlay"
      @click.self="showAddUserModal = false"
    >
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('label.add_user') }}</h3>
          <button class="btn-close" @click="showAddUserModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('label.email') }}</label>
            <input
              v-model="newUser.email"
              type="email"
              class="form-input"
              :placeholder="t('label.enter_email')"
            />
          </div>
          <div class="form-group">
            <label>{{ t('label.password') }}</label>
            <input
              v-model="newUser.password"
              type="password"
              class="form-input"
              :placeholder="t('label.enter_password')"
            />
          </div>
          <div class="form-group">
            <label>{{ t('label.role') }}</label>
            <select v-model="newUser.role" class="form-input">
              <option value="viewer">{{ t('role.viewer') }}</option>
              <option value="user">{{ t('role.user') }}</option>
              <option value="admin">{{ t('role.admin') }}</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showAddUserModal = false">
              {{ t('button.cancel') }}
            </button>
            <button class="btn btn-primary" @click="addUser" :disabled="addingUser">
              {{ addingUser ? t('button.adding') : t('button.add') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 禁用确认模态框 -->
    <div
      v-if="showDisableConfirm"
      class="modal-overlay"
      @click.self="showDisableConfirm = false"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('label.disable_user') }}</h3>
          <button class="btn-close" @click="showDisableConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ t('message.confirm_disable_user', { email: userToDisable?.email }) }}</p>
          <div class="form-group">
            <label>{{ t('label.reason') }}</label>
            <textarea
              v-model="disableReason"
              class="form-input"
              rows="3"
              :placeholder="t('label.enter_reason')"
            ></textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showDisableConfirm = false">
              {{ t('button.cancel') }}
            </button>
            <button class="btn btn-warning" @click="disableUser">
              {{ t('button.confirm_disable') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认模态框 -->
    <div
      v-if="showDeleteConfirm"
      class="modal-overlay"
      @click.self="showDeleteConfirm = false"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('label.delete_user') }}</h3>
          <button class="btn-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ t('message.confirm_delete_user', { email: userToDelete?.email }) }}</p>
          <p class="modal-hint">{{ t('message.operation_irreversible') }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showDeleteConfirm = false">
              {{ t('button.cancel') }}
            </button>
            <button class="btn btn-danger" @click="deleteUser">
              {{ t('button.confirm_delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 批量删除确认模态框 -->
    <div
      v-if="showBatchDeleteConfirm"
      class="modal-overlay"
      @click.self="showBatchDeleteConfirm = false"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('label.batch_delete_users') }}</h3>
          <button class="btn-close" @click="showBatchDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ t('message.confirm_batch_delete', { count: selectedUsers.length }) }}</p>
          <p class="modal-hint">{{ t('message.operation_irreversible') }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showBatchDeleteConfirm = false">
              {{ t('button.cancel') }}
            </button>
            <button class="btn btn-danger" @click="batchDeleteUsers">
              {{ t('button.confirm_delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 权限说明面板 -->
    <div class="panel">
      <div class="panel-header">
        <h2>📋 {{ t('label.role_permissions') }}</h2>
      </div>
      <div class="permissions-grid">
        <div class="permission-card">
          <div class="permission-header admin">
            <span class="role-icon">👑</span>
            <span class="role-name">{{ t('role.admin') }}</span>
          </div>
          <ul class="permission-list">
            <li>{{ t('permission.manage_users') }}</li>
            <li>{{ t('permission.manage_channels') }}</li>
            <li>{{ t('permission.send_push') }}</li>
            <li>{{ t('permission.view_stats') }}</li>
            <li>{{ t('permission.manage_backups') }}</li>
            <li>{{ t('permission.manage_templates') }}</li>
          </ul>
        </div>

        <div class="permission-card">
          <div class="permission-header user">
            <span class="role-icon">👤</span>
            <span class="role-name">{{ t('role.user') }}</span>
          </div>
          <ul class="permission-list">
            <li>{{ t('permission.manage_channels') }}</li>
            <li>{{ t('permission.send_push') }}</li>
            <li>{{ t('permission.view_stats') }}</li>
            <li>{{ t('permission.manage_templates') }}</li>
          </ul>
        </div>

        <div class="permission-card">
          <div class="permission-header viewer">
            <span class="role-icon">👁️</span>
            <span class="role-name">{{ t('role.viewer') }}</span>
          </div>
          <ul class="permission-list">
            <li>{{ t('permission.view_stats') }}</li>
            <li>{{ t('permission.view_history') }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';

const t = useTranslation();
const { showToast } = useGlobalToast();

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  disabled: number;
  disabled_reason?: string;
  created_at: string;
}

const users = ref<User[]>([]);
const loading = ref(true);
const showAddUserModal = ref(false);
const showDisableConfirm = ref(false);
const showDeleteConfirm = ref(false);
const showBatchDeleteConfirm = ref(false);
const userToDisable = ref<User | null>(null);
const userToDelete = ref<User | null>(null);
const disableReason = ref('');
const addingUser = ref(false);
const editingRole = ref<Record<string, string>>({});
const selectedUsers = ref<string[]>([]);
const batchRole = ref('');

const newUser = ref({
  email: '',
  password: '',
  role: 'user' as 'admin' | 'user' | 'viewer',
});

const currentUserId = ref('');

const allSelected = computed(() => {
  const selectableUsers = users.value.filter((u) => u.id !== currentUserId.value);
  return selectableUsers.length > 0 && selectableUsers.every((u) => selectedUsers.value.includes(u.id));
});

const loadUsers = async () => {
  loading.value = true;
  try {
    const { getUsers, getCurrentUser } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    const [usersRes, currentUserRes] = await Promise.all([
      getUsers(token),
      getCurrentUser(token),
    ]);

    users.value = usersRes;
    currentUserId.value = currentUserRes.id;

    users.value.forEach((user) => {
      editingRole.value[user.id] = user.role;
    });
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.load_users_failed'), 'error');
  } finally {
    loading.value = false;
  }
};

const addUser = async () => {
  if (!newUser.value.email || !newUser.value.password) {
    showToast(t('message.fill_required_fields'), 'error');
    return;
  }

  addingUser.value = true;
  try {
    const { createUser } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    await createUser(token, newUser.value.email, newUser.value.password, newUser.value.role);
    showToast(t('message.user_created'), 'success');
    showAddUserModal.value = false;
    newUser.value = { email: '', password: '', role: 'user' };
    await loadUsers();
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.create_user_failed'), 'error');
  } finally {
    addingUser.value = false;
  }
};

const updateUserRole = async (userId: string) => {
  const role = editingRole.value[userId];
  try {
    const { updateUserRole } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    await updateUserRole(token, userId, role);
    showToast(t('message.role_updated'), 'success');
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.update_role_failed'), 'error');
    const user = users.value.find((u) => u.id === userId);
    if (user) {
      editingRole.value[userId] = user.role;
    }
  }
};

const confirmDisableUser = (user: User) => {
  userToDisable.value = user;
  disableReason.value = '';
  showDisableConfirm.value = true;
};

const disableUser = async () => {
  if (!userToDisable.value) return;

  try {
    const { disableUser: apiDisableUser } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    await apiDisableUser(token, userToDisable.value.id, disableReason.value);
    showToast(t('message.user_disabled'), 'success');
    showDisableConfirm.value = false;
    userToDisable.value = null;
    await loadUsers();
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.disable_user_failed'), 'error');
  }
};

const enableUser = async (userId: string) => {
  try {
    const { enableUser: apiEnableUser } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    await apiEnableUser(token, userId);
    showToast(t('message.user_enabled'), 'success');
    await loadUsers();
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.enable_user_failed'), 'error');
  }
};

const confirmDeleteUser = (user: User) => {
  userToDelete.value = user;
  showDeleteConfirm.value = true;
};

const deleteUser = async () => {
  if (!userToDelete.value) return;

  try {
    const { deleteUser: apiDeleteUser } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    await apiDeleteUser(token, userToDelete.value.id);
    showToast(t('message.user_deleted'), 'success');
    showDeleteConfirm.value = false;
    userToDelete.value = null;
    await loadUsers();
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.delete_user_failed'), 'error');
  }
};

const toggleSelect = (userId: string) => {
  const index = selectedUsers.value.indexOf(userId);
  if (index === -1) {
    selectedUsers.value.push(userId);
  } else {
    selectedUsers.value.splice(index, 1);
  }
};

const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedUsers.value = [];
  } else {
    selectedUsers.value = users.value
      .filter((u) => u.id !== currentUserId.value)
      .map((u) => u.id);
  }
};

const clearSelection = () => {
  selectedUsers.value = [];
  batchRole.value = '';
};

const batchUpdateRole = async () => {
  if (!batchRole.value || selectedUsers.value.length === 0) return;

  try {
    const { updateUserRole } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    for (const userId of selectedUsers.value) {
      await updateUserRole(token, userId, batchRole.value);
    }

    showToast(t('message.batch_role_updated'), 'success');
    clearSelection();
    await loadUsers();
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.batch_update_failed'), 'error');
  }
};

const confirmBatchDelete = () => {
  showBatchDeleteConfirm.value = true;
};

const batchDeleteUsers = async () => {
  if (selectedUsers.value.length === 0) return;

  try {
    const { deleteUser: apiDeleteUser } = await import('@/api');
    const token = localStorage.getItem('bee_swarm_token');
    if (!token) return;

    for (const userId of selectedUsers.value) {
      await apiDeleteUser(token, userId);
    }

    showToast(t('message.batch_deleted'), 'success');
    showBatchDeleteConfirm.value = false;
    clearSelection();
    await loadUsers();
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.batch_delete_failed'), 'error');
  }
};

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
};

onMounted(() => {
  loadUsers();
});
</script>

<style scoped>
.user-management {
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

.user-list {
  overflow-x: auto;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.batch-actions span {
  font-size: 14px;
  color: var(--text-secondary, #666);
  font-weight: 500;
}

.batch-role-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  cursor: pointer;
}

.select-all,
.select-row {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.select-row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-table {
  width: 100%;
  border-collapse: collapse;
}

.user-table th,
.user-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.user-table th {
  font-weight: 600;
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.user-table td {
  color: var(--text-primary, #333);
}

.role-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  cursor: pointer;
}

.role-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.disabled {
  background: #fee2e2;
  color: #991b1b;
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

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a6fd6;
}

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-color, #e0e0e0);
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #d97706;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-success:hover {
  background: #059669;
}

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff7875;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-small {
  max-width: 420px;
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

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #666);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #f0f0f0);
}

.modal-hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin: 8px 0 16px;
}

.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.permission-card {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 10px;
  overflow: hidden;
}

.permission-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  color: white;
}

.permission-header.admin {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.permission-header.user {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.permission-header.viewer {
  background: linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%);
}

.role-icon {
  font-size: 20px;
}

.role-name {
  font-weight: 600;
  font-size: 15px;
}

.permission-list {
  padding: 16px;
  margin: 0;
  list-style: none;
}

.permission-list li {
  padding: 8px 0;
  padding-left: 24px;
  position: relative;
  color: var(--text-primary, #333);
  font-size: 13px;
}

.permission-list li::before {
  content: '✓';
  position: absolute;
  left: 8px;
  color: #52c41a;
  font-weight: bold;
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
    margin-bottom: 16px;
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .user-table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }

  .user-table th,
  .user-table td {
    padding: 10px 8px;
    font-size: 12px;
    min-width: 100px;
  }

  .user-table th:first-child,
  .user-table td:first-child {
    min-width: 40px;
  }

  .user-table td:last-child {
    min-width: 180px;
  }

  .btn {
    padding: 6px 12px;
    font-size: 12px;
    height: 30px;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 11px;
  }

  .role-select {
    padding: 4px 8px;
    font-size: 12px;
  }

  .batch-actions {
    padding: 10px;
    gap: 8px;
  }

  .batch-actions span {
    font-size: 13px;
  }

  .batch-role-select {
    padding: 4px 8px;
    font-size: 12px;
  }

  .select-all,
  .select-row {
    width: 16px;
    height: 16px;
  }

  .permissions-grid {
    grid-template-columns: 1fr;
  }

  .modal {
    width: 95%;
    max-width: none;
  }

  .modal-small {
    max-width: 95%;
  }

  .modal-header {
    padding: 14px 16px;
  }

  .modal-body {
    padding: 16px;
  }

  .form-input {
    padding: 10px 12px;
    font-size: 13px;
  }

  .form-actions {
    flex-direction: column;
    gap: 10px;
  }

  .form-actions .btn {
    width: 100%;
    padding: 10px 16px;
    font-size: 14px;
    height: auto;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 15px;
  }

  .user-table th,
  .user-table td {
    padding: 8px 6px;
    font-size: 11px;
    min-width: 80px;
  }

  .user-table td:last-child {
    min-width: 140px;
  }

  .btn {
    padding: 5px 10px;
    font-size: 11px;
  }

  .btn-sm {
    padding: 3px 6px;
    font-size: 10px;
    margin-right: 4px;
  }

  .role-select {
    padding: 3px 6px;
    font-size: 11px;
  }

  .batch-actions {
    padding: 8px;
    gap: 6px;
  }

  .status-badge {
    padding: 2px 8px;
    font-size: 11px;
  }

  .permission-header {
    padding: 12px;
  }

  .permission-list li {
    padding: 6px 0;
    padding-left: 20px;
    font-size: 12px;
  }
}
</style>