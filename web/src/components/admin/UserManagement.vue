<template>
  <div class="user-management">
    <div class="panel">
      <div class="panel-header">
        <h2>👥 {{ t('users.title') }}</h2>
        <div class="header-actions">
          <button class="btn btn-primary" @click="openCreateModal" :disabled="loading">
            + {{ t('users.create') }}
          </button>
        </div>
      </div>

      <div class="user-content">
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <span>{{ t('label.loading') }}</span>
        </div>

        <div v-else-if="users.length === 0" class="empty-state">
          <div class="empty-icon">👥</div>
          <p>{{ t('users.empty') }}</p>
        </div>

        <div v-else class="user-list">
          <div v-for="user in users" :key="user.id" class="user-card">
          <div class="user-avatar">
            <span class="avatar-initial">{{ user.email.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="user-main">
            <div class="user-top">
              <div class="user-name-row">
                <h3 class="user-name">{{ user.email }}</h3>
                <div class="user-tags">
                  <span :class="['tag', `tag-role-${user.role}`]">
                    {{ getRoleName(user.role) }}
                  </span>
                  <span v-if="user.disabled" class="tag tag-status-disabled">
                    {{ t('users.disabled') }}
                  </span>
                </div>
              </div>
            </div>
            <div class="user-body">
              <div class="info-row">
                <span class="info-item">
                  <span class="info-label">{{ t('label.email') }}:</span>
                  <span class="info-value">{{ user.email }}</span>
                </span>
                <span class="info-item">
                  <span class="info-label">{{ t('label.createdAt') }}:</span>
                  <span class="info-value">{{ formatTime(user.created_at) }}</span>
                </span>
                <div v-if="user.disabled && user.disabled_reason" class="info-item">
                  <span class="info-label">{{ t('users.disabledReason') }}:</span>
                  <span class="info-value">{{ user.disabled_reason }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="user-actions">
            <button
              v-if="!user.disabled"
              class="action-btn action-disable"
              @click="openDisableModal(user)"
              :disabled="user.id === currentUserId"
              :title="user.id === currentUserId ? t('users.cannotDisableSelf') : ''"
            >
              {{ t('users.disable') }}
            </button>
            <button
              v-else
              class="action-btn action-enable"
              @click="enableUser(user.id)"
              :disabled="saving"
            >
              {{ t('users.enable') }}
            </button>
            <button class="action-btn action-edit" @click="openRoleModal(user)" :disabled="saving">
              {{ t('users.changeRole') }}
            </button>
            <button
              class="action-btn action-delete"
              @click="confirmDelete(user)"
              :disabled="saving || user.id === currentUserId"
              :title="user.id === currentUserId ? t('users.cannotDeleteSelf') : ''"
            >
              {{ t('button.delete') }}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>

    <!-- 创建用户弹窗 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('users.createUser') }}</h3>
          <button class="modal-close" @click="closeCreateModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('label.email') }}</label>
            <input v-model="createForm.email" type="email" :placeholder="t('placeholder.email')" />
          </div>
          <div class="form-group">
            <label>{{ t('label.password') }}</label>
            <input
              v-model="createForm.password"
              type="password"
              :placeholder="t('placeholder.password')"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeCreateModal" :disabled="saving">
            {{ t('button.cancel') }}
          </button>
          <button class="btn btn-primary" @click="createUser" :disabled="saving">
            {{ saving ? t('label.creating') : t('button.create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 修改角色弹窗 -->
    <div v-if="showRoleModal" class="modal-overlay" @click.self="closeRoleModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('users.changeRole') }}</h3>
          <button class="modal-close" @click="closeRoleModal">✕</button>
        </div>
        <div class="modal-body">
          <p>{{ t('users.changeRoleFor', { email: selectedUser?.email }) }}</p>
          <div class="form-group">
            <label>{{ t('label.role') }}</label>
            <select v-model="selectedRole">
              <option value="admin">{{ t('role.admin') }}</option>
              <option value="user">{{ t('role.user') }}</option>
              <option value="viewer">{{ t('role.viewer') }}</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeRoleModal" :disabled="saving">
            {{ t('button.cancel') }}
          </button>
          <button class="btn btn-primary" @click="updateRole" :disabled="saving">
            {{ saving ? t('label.saving') : t('button.save') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 禁用用户弹窗 -->
    <div v-if="showDisableModal" class="modal-overlay" @click.self="closeDisableModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('users.disableUser') }}</h3>
          <button class="modal-close" @click="closeDisableModal">✕</button>
        </div>
        <div class="modal-body">
          <p>{{ t('users.disableUserConfirm', { email: selectedUser?.email }) }}</p>
          <div class="form-group">
            <label>{{ t('users.disableReason') }}</label>
            <input v-model="disableReason" type="text" :placeholder="t('placeholder.reason')" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeDisableModal" :disabled="saving">
            {{ t('button.cancel') }}
          </button>
          <button class="btn btn-danger" @click="disableUser" :disabled="saving">
            {{ saving ? t('label.processing') : t('users.disable') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="modal modal-danger">
        <div class="modal-header">
          <h3>{{ t('users.deleteUser') }}</h3>
          <button class="modal-close" @click="closeDeleteModal">✕</button>
        </div>
        <div class="modal-body">
          <p>{{ t('users.deleteUserConfirm', { email: selectedUser?.email }) }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeDeleteModal" :disabled="saving">
            {{ t('button.cancel') }}
          </button>
          <button class="btn btn-danger" @click="deleteUser" :disabled="saving">
            {{ saving ? t('label.processing') : t('button.delete') }}
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
import { usePermission } from '@/composables/usePermission';
import {
  getUsers,
  createUser as apiCreateUser,
  updateUserRole,
  disableUser as apiDisableUser,
  enableUser as apiEnableUser,
  deleteUser as apiDeleteUser,
  type UserInfo,
} from '@/api';

const t = useTranslation();
const authStore = useAuth();
const { currentUserId } = usePermission();

const loading = ref(false);
const saving = ref(false);
const users = ref<UserInfo[]>([]);

const showCreateModal = ref(false);
const showRoleModal = ref(false);
const showDisableModal = ref(false);
const showDeleteModal = ref(false);
const selectedUser = ref<UserInfo | null>(null);
const selectedRole = ref<UserInfo['role']>('user');
const disableReason = ref('');
const createForm = ref({
  email: '',
  password: '',
});

const formatTime = (timeStr: string) => {
  const date = new Date(timeStr);
  return date.toLocaleString();
};

const getRoleName = (role: UserInfo['role']) => {
  const roleNames: Record<UserInfo['role'], string> = {
    admin: t('role.admin'),
    user: t('role.user'),
    viewer: t('role.viewer'),
  };
  return roleNames[role] || role;
};

const loadUsers = async () => {
  loading.value = true;
  try {
    const data = await getUsers(authStore.accessToken);
    users.value = data.users;
  } catch (err: unknown) {
    console.error('加载用户列表失败:', err);
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  createForm.value = { email: '', password: '' };
  showCreateModal.value = true;
};

const closeCreateModal = () => {
  showCreateModal.value = false;
};

const createUser = async () => {
  if (!createForm.value.email || !createForm.value.password) return;
  saving.value = true;
  try {
    await apiCreateUser(authStore.accessToken, createForm.value);
    await loadUsers();
    closeCreateModal();
  } catch (err: unknown) {
    console.error('创建用户失败:', err);
  } finally {
    saving.value = false;
  }
};

const openRoleModal = (user: UserInfo) => {
  selectedUser.value = user;
  selectedRole.value = user.role;
  showRoleModal.value = true;
};

const closeRoleModal = () => {
  showRoleModal.value = false;
  selectedUser.value = null;
};

const updateRole = async () => {
  if (!selectedUser.value) return;
  saving.value = true;
  try {
    await updateUserRole(authStore.accessToken, selectedUser.value.id, selectedRole.value);
    await loadUsers();
    closeRoleModal();
  } catch (err: unknown) {
    console.error('更新角色失败:', err);
  } finally {
    saving.value = false;
  }
};

const openDisableModal = (user: UserInfo) => {
  selectedUser.value = user;
  disableReason.value = '';
  showDisableModal.value = true;
};

const closeDisableModal = () => {
  showDisableModal.value = false;
  selectedUser.value = null;
  disableReason.value = '';
};

const disableUser = async () => {
  if (!selectedUser.value) return;
  saving.value = true;
  try {
    await apiDisableUser(
      authStore.accessToken,
      selectedUser.value.id,
      disableReason.value || undefined
    );
    await loadUsers();
    closeDisableModal();
  } catch (err: unknown) {
    console.error('禁用用户失败:', err);
  } finally {
    saving.value = false;
  }
};

const enableUser = async (userId: string) => {
  saving.value = true;
  try {
    await apiEnableUser(authStore.accessToken, userId);
    await loadUsers();
  } catch (err: unknown) {
    console.error('启用用户失败:', err);
  } finally {
    saving.value = false;
  }
};

const confirmDelete = (user: UserInfo) => {
  selectedUser.value = user;
  showDeleteModal.value = true;
};

const closeDeleteModal = () => {
  showDeleteModal.value = false;
  selectedUser.value = null;
};

const deleteUser = async () => {
  if (!selectedUser.value) return;
  saving.value = true;
  try {
    await apiDeleteUser(authStore.accessToken, selectedUser.value.id);
    await loadUsers();
    closeDeleteModal();
  } catch (err: unknown) {
    console.error('删除用户失败:', err);
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadUsers();
});
</script>

<style scoped>
.user-management {
  width: 100%;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  height: auto;
  min-height: 50px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  line-height: 36px;
}

.header-actions {
  display: flex;
  gap: 12px;
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

.user-content {
  overflow-y: auto;
  flex: 1;
}

.user-list {
  padding: 20px;
  display: grid;
  gap: 12px;
}

.user-card {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  background: white;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  transition: all 0.25s ease;
  overflow: hidden;
}

.user-card:hover {
  border-color: #e0e0e0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.user-avatar {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: transform 0.3s ease;
}

.user-card:hover .user-avatar {
  transform: scale(1.05);
}

.avatar-initial {
  color: white;
  font-size: 20px;
  font-weight: 700;
}

.user-main {
  flex: 1;
  min-width: 0;
}

.user-top {
  margin-bottom: 12px;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.user-tags {
  display: flex;
  gap: 8px;
}

.tag {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: all 0.2s ease;
}

.tag-role-admin {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.tag-role-user {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

.tag-role-viewer {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
}

.tag-status-disabled {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
}

.user-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.info-label {
  color: var(--text-secondary);
  font-weight: 500;
}

.info-value {
  color: var(--text-primary);
}

.user-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 20px;
  border-left: 1px solid var(--border-color);
}

.action-btn {
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.25s ease;
  min-width: 90px;
  text-align: center;
}

.action-btn:hover {
  transform: translateX(4px);
  color: var(--text-primary);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.action-edit {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.action-edit:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  color: white;
}

.action-disable {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.action-disable:hover {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  color: white;
}

.action-enable {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.action-enable:hover {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  color: white;
}

.action-delete {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.action-delete:hover {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
  color: white;
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

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: all 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
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
  .user-card {
    flex-direction: column;
  }

  .user-actions {
    flex-direction: row;
    border-left: none;
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
    padding-left: 0;
  }
}
</style>
