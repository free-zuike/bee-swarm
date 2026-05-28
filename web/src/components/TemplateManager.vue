<template>
  <div class="template-manager">
    <div class="panel">
      <div class="panel-header">
        <h2>📝 {{ t('templates.title') }}</h2>
        <button class="btn btn-primary" @click="openCreateModal" :disabled="saving">
          + {{ t('templates.create') }}
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('common.loading') || '加载中...' }}</span>
      </div>

      <div v-else-if="templates.length === 0" class="empty-state">
        <div class="empty-icon">📝</div>
        <p>{{ t('templates.empty') }}</p>
        <button class="btn btn-primary" @click="openCreateModal">{{ t('templates.createFirst') }}</button>
      </div>

      <div v-else class="template-list">
        <div v-for="tpl in templates" :key="tpl.id" class="template-item">
          <div class="template-info">
            <div class="template-name">{{ tpl.name }}</div>
            <div class="template-title">{{ tpl.title }}</div>
            <div class="template-content">{{ tpl.content }}</div>
            <div class="template-meta">
              <span class="meta-tag channel">{{ tpl.channel }}</span>
              <span v-if="tpl.useMarkdown" class="meta-tag">Markdown</span>
              <span v-if="tpl.url" class="meta-tag">URL: {{ tpl.url }}</span>
            </div>
          </div>
          <div class="template-actions">
            <button class="btn btn-small btn-secondary" @click="useTemplate(tpl)">
              {{ t('templates.use') }}
            </button>
            <button class="btn-icon" @click="editTemplate(tpl)" title="{{ t('common.edit') }}">✏️</button>
            <button class="btn-icon" @click="confirmDelete(tpl)" title="{{ t('common.delete') }}">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingTemplate ? t('templates.edit') : t('templates.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>
        <form @submit.prevent="saveTemplate" class="modal-body">
          <div class="form-group">
            <label>{{ t('templates.name') }} *</label>
            <input v-model="form.name" type="text" :placeholder="t('templates.namePlaceholder')" required />
          </div>
          <div class="form-group">
            <label>{{ t('label.title') }} *</label>
            <input v-model="form.title" type="text" :placeholder="t('templates.titlePlaceholder')" required />
          </div>
          <div class="form-group">
            <label>{{ t('label.content') || '内容' }}</label>
            <textarea v-model="form.content" :placeholder="t('templates.contentPlaceholder')" rows="4"></textarea>
          </div>
          <div class="form-group">
            <label>{{ t('templates.url') }}</label>
            <input v-model="form.url" type="url" :placeholder="t('templates.urlPlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ t('templates.channels') }}</label>
            <div class="channels-grid">
              <label v-for="ch in allChannels" :key="ch" class="channel-checkbox">
                <input type="checkbox" :value="ch" v-model="form.channels" />
                <span>{{ ch }}</span>
              </label>
            </div>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.useMarkdown" />
              <span>{{ t('templates.useMarkdown') }}</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? (t('common.saving') || '保存中...') : (t('common.save') || '保存') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('templates.confirmDelete') }}</h3>
          <button class="btn-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ t('templates.deleteConfirm', { name: deletingTemplate?.name }) }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showDeleteConfirm = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-danger" @click="doDelete" :disabled="deleting">
              {{ deleting ? (t('common.deleting') || '删除中...') : t('common.delete') }}
            </button>
          </div>
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
const showModal = ref(false);
const showDeleteConfirm = ref(false);
const editingTemplate = ref<PushTemplate | null>(null);
const deletingTemplate = ref<PushTemplate | null>(null);
const templates = ref<PushTemplate[]>([]);

const allChannels = ['email', 'sms', 'push', 'wechat', 'dingtalk', 'feishu', 'telegram', 'slack', 'discord', 'webpush'];

const form = reactive({
  name: '',
  title: '',
  content: '',
  url: '',
  useMarkdown: false,
  channels: [] as string[],
});

function openCreateModal() {
  editingTemplate.value = null;
  form.name = '';
  form.title = '';
  form.content = '';
  form.url = '';
  form.useMarkdown = false;
  form.channels = [];
  showModal.value = true;
}

function editTemplate(tpl: PushTemplate) {
  editingTemplate.value = tpl;
  form.name = tpl.name;
  form.title = tpl.title;
  form.content = tpl.content;
  form.url = tpl.url || '';
  form.useMarkdown = tpl.useMarkdown || false;
  form.channels = tpl.channels ? [...tpl.channels] : [];
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingTemplate.value = null;
}

function useTemplate(tpl: PushTemplate) {
  emit('use-template', tpl);
}

function confirmDelete(tpl: PushTemplate) {
  deletingTemplate.value = tpl;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!props.accessToken || !deletingTemplate.value) return;
  deleting.value = true;
  try {
    await deleteTemplate(props.accessToken, deletingTemplate.value.id);
    templates.value = templates.value.filter((t) => t.id !== deletingTemplate.value!.id);
    showDeleteConfirm.value = false;
    deletingTemplate.value = null;
  } catch (err) {
    alert((err as Error).message);
  } finally {
    deleting.value = false;
  }
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
      templates.value.push(result.template);
    }
    closeModal();
  } catch (err) {
    alert((err as Error).message);
  } finally {
    saving.value = false;
  }
}

async function loadTemplates() {
  if (!props.accessToken) return;
  loading.value = true;
  try {
    const data = await getTemplates(props.accessToken);
    templates.value = data.templates || [];
  } catch (err) {
    console.error('加载模板失败:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadTemplates);
</script>

<style scoped>
.template-manager {
  padding: 0;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.panel-header {
  height: 50px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  padding: 0;
  line-height: 36px;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0 0 16px;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 10px;
  border: 1px solid var(--border-color, #f0f0f0);
  transition: all 0.2s;
}

.template-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 4px;
}

.template-title {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin-bottom: 4px;
}

.template-content {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 8px;
}

.template-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e8e8e8;
  color: #666;
}

.meta-tag.channel {
  background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
  color: #667eea;
  font-weight: 600;
}

.template-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
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
  max-width: 560px;
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

.btn-close:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
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

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
  background: var(--bg-panel, white);
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-group textarea {
  resize: vertical;
}

.channels-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.channel-checkbox:hover {
  border-color: #667eea;
}

.channel-checkbox input {
  width: auto;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #f0f0f0);
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

.btn-secondary {
  background: var(--bg-secondary, #f8f9fa);
  color: var(--text-primary, #333);
  border: 2px solid var(--border-color, #e0e0e0);
}

.btn-secondary:hover {
  border-color: #667eea;
}

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff7875;
}

.btn-small {
  padding: 6px 14px;
  font-size: 13px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: var(--bg-secondary, #f8f9fa);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
