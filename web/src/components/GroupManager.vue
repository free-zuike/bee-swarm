<template>
  <div class="group-manager">
    <div class="header">
      <h2 class="section-title">{{ t('groups.title') }}</h2>
      <button class="btn-primary" @click="showCreateModal = true">
        + {{ t('groups.create') }}
      </button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>

    <div v-else-if="groups.length === 0" class="empty-state">
      <div class="empty-icon">📂</div>
      <p>{{ t('groups.empty') }}</p>
      <button class="btn-secondary" @click="showCreateModal = true">
        {{ t('groups.createFirst') }}
      </button>
    </div>

    <div v-else class="group-list">
      <div
        v-for="group in groups"
        :key="group.id"
        class="group-card"
      >
        <div class="group-header">
          <div class="group-info">
            <span class="group-icon">📂</span>
            <h3 class="group-name">{{ group.name }}</h3>
          </div>
          <button class="btn-icon" @click="confirmDelete(group)" :title="t('common.delete')">
            🗑️
          </button>
        </div>

        <div class="group-channels">
          <span
            v-for="channelId in group.channels"
            :key="channelId"
            class="channel-badge"
          >
            {{ getChannelIcon(channelId) }}
          </span>
        </div>

        <div class="group-footer">
          <button class="btn-sm btn-primary" @click="useGroup(group)">
            {{ t('groups.use') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('groups.create') }}</h3>
          <button class="btn-close" @click="showCreateModal = false">×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('groups.name') }}</label>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('groups.namePlaceholder')"
            />
          </div>

          <div class="form-group">
            <label>{{ t('groups.channels') }}</label>
            <div class="channel-selector">
              <button
                v-for="ch in availableChannels"
                :key="ch.id"
                class="channel-btn"
                :class="{ active: form.channels.includes(ch.id) }"
                @click="toggleChannel(ch.id)"
              >
                {{ ch.icon }}
                {{ ch.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="showCreateModal = false">
            {{ t('common.cancel') }}
          </button>
          <button class="btn-primary" @click="saveGroup" :disabled="saving || !form.name || form.channels.length === 0">
            {{ saving ? t('common.saving') : t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deletingGroup" class="modal-overlay" @click.self="deletingGroup = null">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>{{ t('groups.confirmDelete') }}</h3>
        </div>
        <div class="modal-body">
          <p>{{ t('groups.deleteConfirm', { name: deletingGroup.name }) }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="deletingGroup = null">
            {{ t('common.cancel') }}
          </button>
          <button class="btn-danger" @click="doDelete" :disabled="deleting">
            {{ deleting ? t('common.deleting') : t('common.delete') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { t } from '@/i18n';
import {
  getChannelGroups,
  createChannelGroup,
  deleteChannelGroup,
  type ChannelGroup,
  type PushChannel,
} from '@/api';
import { useAuth } from '@/composables/useAuth';

const emit = defineEmits<{
  (e: 'use-group', channels: PushChannel[]): void;
}>();

const { token } = useAuth();

const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const groups = ref<ChannelGroup[]>([]);
const showCreateModal = ref(false);
const deletingGroup = ref<ChannelGroup | null>(null);

const availableChannels = [
  { id: 'wework', icon: '💼', name: '企业微信' },
  { id: 'dingtalk', icon: '🅰️', name: '钉钉' },
  { id: 'feishu', icon: '🪶', name: '飞书' },
  { id: 'telegram', icon: '✈️', name: 'Telegram' },
  { id: 'bark', icon: '📱', name: 'Bark' },
  { id: 'ntfy', icon: '📢', name: 'ntfy' },
  { id: 'email', icon: '📧', name: '邮件' },
  { id: 'slack', icon: '💬', name: 'Slack' },
  { id: 'discord', icon: '🎮', name: 'Discord' },
];

const form = reactive({
  name: '',
  channels: [] as string[],
});

onMounted(async () => {
  await loadGroups();
});

async function loadGroups() {
  if (!token.value) return;
  loading.value = true;
  try {
    const data = await getChannelGroups(token.value);
    groups.value = data.groups;
  } catch (err) {
    console.error('Failed to load groups:', err);
  } finally {
    loading.value = false;
  }
}

function confirmDelete(group: ChannelGroup) {
  deletingGroup.value = group;
}

async function doDelete() {
  if (!token.value || !deletingGroup.value) return;
  deleting.value = true;
  try {
    await deleteChannelGroup(token.value, deletingGroup.value.id);
    groups.value = groups.value.filter((g) => g.id !== deletingGroup.value!.id);
    deletingGroup.value = null;
  } catch (err) {
    console.error('Failed to delete group:', err);
  } finally {
    deleting.value = false;
  }
}

function useGroup(group: ChannelGroup) {
  emit('use-group', group.channels);
}

function toggleChannel(channelId: string) {
  const index = form.channels.indexOf(channelId);
  if (index === -1) {
    form.channels.push(channelId);
  } else {
    form.channels.splice(index, 1);
  }
}

async function saveGroup() {
  if (!token.value || !form.name || form.channels.length === 0) return;
  saving.value = true;
  try {
    const result = await createChannelGroup(token.value, {
      name: form.name,
      channels: form.channels as PushChannel[],
    });
    groups.value.unshift(result.group);
    showCreateModal.value = false;
    form.name = '';
    form.channels = [];
  } catch (err) {
    console.error('Failed to create group:', err);
  } finally {
    saving.value = false;
  }
}

function getChannelIcon(channelId: string): string {
  return availableChannels.find((c) => c.id === channelId)?.icon || '📢';
}
</script>

<style scoped>
.group-manager {
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary:hover {
  background: #4f46e5;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
}

.btn-danger {
  background: var(--color-error);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  font-size: 1rem;
  opacity: 0.6;
}

.btn-icon:hover {
  opacity: 1;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--color-text-secondary);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state p {
  margin-bottom: 1rem;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.group-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.group-icon {
  font-size: 1.25rem;
}

.group-name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.group-channels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.channel-badge {
  font-size: 1.25rem;
}

.group-footer {
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
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
  background: var(--color-surface);
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
}

.modal-sm {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.875rem;
  background: var(--color-background);
  color: var(--color-text);
}

.channel-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.channel-btn {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.875rem;
}

.channel-btn:hover {
  border-color: var(--color-primary);
}

.channel-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}
</style>
