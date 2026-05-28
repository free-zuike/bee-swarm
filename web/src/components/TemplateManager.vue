<template>
  <div class="template-manager">
    <div class="header">
      <h2 class="section-title">{{ t('templates.title') }}</h2>
      <button class="btn-primary" @click="showCreateModal = true">
        + {{ t('templates.create') }}
      </button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
    </div>

    <div v-else-if="templates.length === 0" class="empty-state">
      <div class="empty-icon">📝</div>
      <p>{{ t('templates.empty') }}</p>
      <button class="btn-secondary" @click="showCreateModal = true">
        {{ t('templates.createFirst') }}
      </button>
    </div>

    <div v-else class="template-grid">
      <div
        v-for="template in templates"
        :key="template.id"
        class="template-card"
      >
        <div class="template-header">
          <h3 class="template-name">{{ template.name }}</h3>
          <div class="template-actions">
            <button class="btn-icon" @click="editTemplate(template)" :title="t('common.edit')">
              ✏️
            </button>
            <button class="btn-icon" @click="confirmDelete(template)" :title="t('common.delete')">
              🗑️
            </button>
          </div>
        </div>

        <div class="template-content">
          <div class="template-title">{{ template.title }}</div>
          <div class="template-body">{{ template.content || t('templates.noContent') }}</div>
        </div>

        <div class="template-meta">
          <div v-if="template.channels?.length" class="template-channels">
            <span
              v-for="ch in template.channels"
              :key="ch"
              class="channel-badge"
            >
              {{ getChannelIcon(ch) }}
            </span>
          </div>
          <div class="template-date">
            {{ formatDate(template.updatedAt) }}
          </div>
        </div>

        <div class="template-footer">
          <button class="btn-sm btn-primary" @click="useTemplate(template)">
            {{ t('templates.use') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showCreateModal || editingTemplate" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingTemplate ? t('templates.edit') : t('templates.create') }}</h3>
          <button class="btn-close" @click="closeModal">×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('templates.name') }}</label>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('templates.namePlaceholder')"
            />
          </div>

          <div class="form-group">
            <label>{{ t('templates.title') }}</label>
            <input
              v-model="form.title"
              type="text"
              :placeholder="t('templates.titlePlaceholder')"
            />
          </div>

          <div class="form-group">
            <label>{{ t('templates.content') }}</label>
            <textarea
              v-model="form.content"
              :placeholder="t('templates.contentPlaceholder')"
              rows="4"
            ></textarea>
          </div>

          <div class="form-group">
            <label>{{ t('templates.url') }}</label>
            <input
              v-model="form.url"
              type="url"
              :placeholder="t('templates.urlPlaceholder')"
            />
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.useMarkdown" type="checkbox" />
              {{ t('templates.useMarkdown') }}
            </label>
          </div>

          <div class="form-group">
            <label>{{ t('templates.channels') }}</label>
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
          <button class="btn-secondary" @click="closeModal">
            {{ t('common.cancel') }}
          </button>
          <button class="btn-primary" @click="saveTemplate" :disabled="saving">
            {{ saving ? t('common.saving') : t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deletingTemplate" class="modal-overlay" @click.self="deletingTemplate = null">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>{{ t('templates.confirmDelete') }}</h3>
        </div>
        <div class="modal-body">
          <p>{{ t('templates.deleteConfirm', { name: deletingTemplate.name }) }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="deletingTemplate = null">
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
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type PushTemplate,
} from '@/api';

const emit = defineEmits<{
  (e: 'use-template', template: PushTemplate): void;
}>();

const props = defineProps<{
  accessToken: string;
}>();

const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const templates = ref<PushTemplate[]>([]);
const showCreateModal = ref(false);
const editingTemplate = ref<PushTemplate | null>(null);
const deletingTemplate = ref<PushTemplate | null>(null);

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
  title: '',
  content: '',
  url: '',
  useMarkdown: false,
  channels: [] as string[],
});

onMounted(async () => {
  await loadTemplates();
});

async function loadTemplates() {
  if (!props.accessToken) return;
  loading.value = true;
  try {
    const data = await getTemplates(props.accessToken);
    templates.value = data.templates;
  } catch (err) {
    console.error('Failed to load templates:', err);
  } finally {
    loading.value = false;
  }
}

function editTemplate(template: PushTemplate) {
  editingTemplate.value = template;
  Object.assign(form, {
    name: template.name,
    title: template.title,
    content: template.content,
    url: template.url || '',
    useMarkdown: template.useMarkdown || false,
    channels: template.channels || [],
  });
}

function confirmDelete(template: PushTemplate) {
  deletingTemplate.value = template;
}

async function doDelete() {
  if (!props.accessToken || !deletingTemplate.value) return;
  deleting.value = true;
  try {
    await deleteTemplate(props.accessToken, deletingTemplate.value.id);
    templates.value = templates.value.filter((t) => t.id !== deletingTemplate.value!.id);
    deletingTemplate.value = null;
  } catch (err) {
    console.error('Failed to delete template:', err);
  } finally {
    deleting.value = false;
  }
}

function useTemplate(template: PushTemplate) {
  emit('use-template', template);
}

function toggleChannel(channelId: string) {
  const index = form.channels.indexOf(channelId);
  if (index === -1) {
    form.channels.push(channelId);
  } else {
    form.channels.splice(index, 1);
  }
}

function closeModal() {
  showCreateModal.value = false;
  editingTemplate.value = null;
  Object.assign(form, {
    name: '',
    title: '',
    content: '',
    url: '',
    useMarkdown: false,
    channels: [],
  });
}

async function saveTemplate() {
  if (!props.accessToken || !form.name || !form.title) return;
  saving.value = true;
  try {
    const templateData = {
      name: form.name,
      title: form.title,
      content: form.content,
      url: form.url || undefined,
      useMarkdown: form.useMarkdown,
      channels: form.channels.length > 0 ? form.channels as any : undefined,
    };

    if (editingTemplate.value) {
      const result = await updateTemplate(props.accessToken, editingTemplate.value.id, templateData);
      const index = templates.value.findIndex((t) => t.id === editingTemplate.value!.id);
      if (index !== -1) {
        templates.value[index] = result.template;
      }
    } else {
      const result = await createTemplate(props.accessToken, templateData);
      templates.value.unshift(result.template);
    }
    closeModal();
  } catch (err) {
    console.error('Failed to save template:', err);
  } finally {
    saving.value = false;
  }
}

function getChannelIcon(channelId: string): string {
  return availableChannels.find((c) => c.id === channelId)?.icon || '📢';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.template-manager {
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
  transition: background 0.2s;
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
  font-weight: 500;
}

.btn-secondary:hover {
  background: var(--color-background);
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
  transition: opacity 0.2s;
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

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.template-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.template-name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.template-actions {
  display: flex;
  gap: 0.25rem;
}

.template-content {
  flex: 1;
  margin-bottom: 0.75rem;
}

.template-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.template-body {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.template-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}

.template-channels {
  display: flex;
  gap: 0.25rem;
}

.channel-badge {
  font-size: 0.875rem;
}

.template-footer {
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
  max-height: 90vh;
  overflow-y: auto;
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
  font-size: 1.125rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--color-text-secondary);
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
  font-size: 0.875rem;
}

.form-group input[type="text"],
.form-group input[type="url"],
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.875rem;
  background: var(--color-background);
  color: var(--color-text);
}

.form-group textarea {
  resize: vertical;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
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
  transition: all 0.2s;
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
