<template>
  <div class="template-manager" :class="{ dark: isDark }">
    <div class="panel">
      <div class="panel-header">
        <h2>📝 {{ t('templates.title') }}</h2>
        <div class="header-actions">
          <div v-if="selectedTemplateIds.size > 0" class="selected-actions">
            <span class="selected-count">{{
              t('label.items_selected', { count: selectedTemplateIds.size })
            }}</span>
            <button class="btn btn-sm btn-secondary" @click="clearSelection">
              {{ t('label.deselect') }}
            </button>
            <button class="btn btn-sm btn-danger" @click="confirmBatchDelete">
              {{ t('label.batch_delete') }}
            </button>
          </div>
          <button class="btn btn-primary" @click="openCreateModal" :disabled="saving">
            + {{ t('templates.create') }}
          </button>
        </div>
      </div>

      <!-- 搜索和筛选 -->
      <div class="filter-bar">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('label.searchTemplatePlaceholder')"
          class="search-input"
        />
        <select v-model="selectedCategory" class="category-select">
          <option value="">{{ t('label.allCategories') }}</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('label.loading') }}</span>
      </div>

      <div v-else-if="filteredTemplates.length === 0" class="empty-state">
        <div class="empty-icon"></div>
        <p>
          {{
            searchQuery || selectedCategory ? t('label.noMatchingTemplates') : t('templates.empty')
          }}
        </p>
      </div>

      <div v-else class="template-list">
        <div v-for="tpl in filteredTemplates" :key="tpl.id" class="template-card">
          <div class="template-select">
            <input
              type="checkbox"
              :checked="selectedTemplateIds.has(tpl.id)"
              @change="toggleSelect(tpl.id)"
            />
          </div>
          <div class="template-main">
            <div class="template-top">
              <div class="template-name-row">
                <h3 class="template-name">{{ tpl.name }}</h3>
                <div class="template-tags">
                  <span v-if="tpl.category" class="tag tag-category">{{ tpl.category }}</span>
                  <span v-if="tpl.useMarkdown" class="tag tag-markdown">Markdown</span>
                  <span v-for="ch in tpl.channels" :key="ch" class="tag tag-channel">{{
                    getChannelName(ch)
                  }}</span>
                </div>
              </div>
            </div>
            <div class="template-body">
              <div class="field-row">
                <span class="field-label">{{ t('label.title') }}</span>
                <span class="field-value">{{ tpl.title }}</span>
              </div>
              <div class="field-row">
                <span class="field-label">{{ t('label.content') }}</span>
                <span class="field-value field-content">{{
                  tpl.content || t('templates.noContent')
                }}</span>
              </div>
              <div v-if="tpl.url" class="field-row">
                <span class="field-label">URL</span>
                <span class="field-value field-url">{{ tpl.url }}</span>
              </div>
            </div>
          </div>
          <div class="template-actions">
            <button class="action-btn action-use" @click="useTemplate(tpl)">
              {{ t('button.use') }}
            </button>
            <button class="action-btn action-edit" @click="editTemplate(tpl)">
              {{ t('button.edit') }}
            </button>
            <button class="action-btn action-delete" @click="confirmDelete(tpl)">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>{{ editingTemplate ? t('templates.edit') : t('templates.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>
        <form @submit.prevent="saveTemplate" class="modal-body">
          <div class="form-group">
            <label>{{ t('templates.name') }} *</label>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('templates.namePlaceholder')"
              required
            />
          </div>
          <div class="form-group">
            <label>{{ t('label.title') }} *</label>
            <input
              v-model="form.title"
              type="text"
              :placeholder="t('templates.titlePlaceholder')"
              required
            />
            <p class="variable-hint">
              {{ t('label.supportsVariables') }}: <code v-text="'{{date}}'"></code>
              <code v-text="'{{time}}'"></code> <code v-text="'{{name}}'"></code>
              {{ t('label.etc') }}
            </p>
          </div>
          <div class="form-group">
            <label>{{ t('label.content') }}</label>
            <textarea
              v-model="form.content"
              :placeholder="t('templates.contentPlaceholder')"
              rows="4"
            ></textarea>
          </div>
          <div class="form-group">
            <label>{{ t('templates.url') }}</label>
            <input v-model="form.url" type="url" :placeholder="t('templates.urlPlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ t('templates.channels') }}</label>
            <div class="channels-grid">
              <label v-for="ch in allChannels" :key="ch.id" class="channel-checkbox">
                <input type="checkbox" :value="ch.id" v-model="form.channels" />
                <span>{{ ch.icon }} {{ ch.name }}</span>
              </label>
            </div>
          </div>
          <div class="form-group">
            <label>{{ t('label.category') }}</label>
            <input
              v-model="form.category"
              type="text"
              :placeholder="t('label.categoryPlaceholder')"
              list="category-list"
            />
            <datalist id="category-list">
              <option v-for="cat in categories" :key="cat" :value="cat" />
            </datalist>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.useMarkdown" />
              <span>{{ t('templates.useMarkdown') }}</span>
            </label>
          </div>

          <!-- 变量管理 -->
          <div class="form-group">
            <label>{{ t('label.variablesManagement') }}</label>
            <div class="variables-section">
              <div v-if="detectedVariables.length > 0" class="variables-list">
                <div class="variables-header">
                  <span>{{ t('label.detectedVariables') }}</span>
                  <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    @click="showPreview = true"
                  >
                    {{ t('button.preview') }}
                  </button>
                </div>
                <div v-for="v in detectedVariables" :key="v" class="variable-item">
                  <span class="variable-key" v-text="wrapVar(v)"></span>
                  <input
                    v-model="variableValues[v]"
                    type="text"
                    :placeholder="t('label.valueFor', { variable: v })"
                    class="variable-input"
                  />
                </div>
              </div>
              <div v-else class="variables-empty">
                <p>
                  {{ t('label.defineVariables') }} <code v-text="wrapVar('variable')"></code>
                  {{ t('label.format') }}
                </p>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              {{ t('common.cancel') }}
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? t('label.saving') : t('common.save') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 预览模态框 -->
    <div v-if="showPreview" class="modal-overlay" @click.self="showPreview = false">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>{{ t('label.templatePreview') }}</h3>
          <button class="btn-close" @click="showPreview = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="previewLoading" class="preview-loading">
            <div class="spinner"></div>
            <p>{{ t('message.generatingPreview') }}</p>
          </div>
          <template v-else>
            <div class="preview-section">
              <h4>{{ t('label.previewResult') }}</h4>
              <div class="preview-item">
                <label>{{ t('label.title') }}:</label>
                <p class="preview-value">{{ previewResult.title || t('label.previewEmpty') }}</p>
              </div>
              <div class="preview-item">
                <label>{{ t('label.content') }}:</label>
                <p class="preview-value preview-content">
                  {{ previewResult.content || t('label.previewEmpty') }}
                </p>
              </div>
              <div v-if="previewResult.url" class="preview-item">
                <label>URL:</label>
                <p class="preview-value preview-url">{{ previewResult.url }}</p>
              </div>
            </div>
            <div class="preview-auto-vars">
              <h4>{{ t('label.autoVariables') }}</h4>
              <div class="auto-vars-grid">
                <div v-for="(val, key) in autoVarsDisplay" :key="key" class="auto-var">
                  <code v-text="wrapVar(key)"></code>
                  <span>=</span>
                  <span class="auto-var-value">{{ val }}</span>
                </div>
              </div>
            </div>
          </template>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showPreview = false">
              {{ t('button.close') }}
            </button>
          </div>
        </div>
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
            <button class="btn btn-secondary" @click="showDeleteConfirm = false">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-danger" @click="doDelete" :disabled="deleting">
              {{ deleting ? t('label.deleting') : t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showBatchDeleteConfirm"
      class="modal-overlay"
      @click.self="showBatchDeleteConfirm = false"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('label.batchDeleteConfirm') }}</h3>
          <button class="btn-close" @click="showBatchDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>
            {{ t('message.confirmDeleteItems', { count: selectedTemplateIds.size }) }}
            {{ t('message.operationIrreversible') }}
          </p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showBatchDeleteConfirm = false">
              {{ t('button.cancel') }}
            </button>
            <button class="btn btn-danger" @click="doBatchDelete" :disabled="deleting">
              {{ deleting ? t('label.deleting') : t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { t } from '@/i18n';
import { useThemeStore } from '@/stores/theme';
import { useGlobalToast } from '@/composables/useToast';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type PushTemplate,
  type PushChannel,
  type ChannelConfig,
} from '@/api';

const { showToast } = useGlobalToast();

const emit = defineEmits<{
  'use-template': [template: PushTemplate];
}>();

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const props = defineProps<{
  accessToken: string;
  channels: ChannelConfig[];
}>();

const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showModal = ref(false);
const showDeleteConfirm = ref(false);
const showPreview = ref(false);
const showBatchDeleteConfirm = ref(false);
const editingTemplate = ref<PushTemplate | null>(null);
const deletingTemplate = ref<PushTemplate | null>(null);
const templates = ref<PushTemplate[]>([]);
const previewLoading = ref(false);
const previewResult = ref({ title: '', content: '', url: '' });
const variableValues = reactive<Record<string, string>>({});
const searchQuery = ref('');
const selectedCategory = ref('');
const selectedTemplateIds = ref<Set<string>>(new Set());

function getChannelName(ch: string): string {
  return t(`channel.${ch}`) || ch;
}

const allChannels = computed(() => {
  return props.channels
    .filter((c) => c.enabled)
    .map((c) => ({
      id: c.id,
      name: t(`channel.${c.id}`) || c.id,
      icon: c.icon,
    }));
});

const categories = computed(() => {
  const cats = new Set<string>();
  templates.value.forEach((t) => {
    if (t.category) {
      cats.add(t.category);
    }
  });
  return Array.from(cats).sort();
});

const filteredTemplates = computed(() => {
  return templates.value.filter((tpl) => {
    const matchesSearch =
      !searchQuery.value ||
      tpl.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      tpl.title.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesCategory = !selectedCategory.value || tpl.category === selectedCategory.value;
    return matchesSearch && matchesCategory;
  });
});

const form = reactive({
  name: '',
  title: '',
  content: '',
  url: '',
  useMarkdown: false,
  category: '',
  channels: [] as PushChannel[],
});

function wrapVar(name: string): string {
  return `{{${name}}}`;
}

const detectedVariables = computed(() => {
  const varRegex = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  const autoVars = new Set(['date', 'time', 'datetime', 'timestamp', 'year', 'month', 'day']);

  [form.title, form.content, form.url].forEach((text) => {
    if (!text) return;
    let match;
    while ((match = varRegex.exec(text)) !== null) {
      if (!autoVars.has(match[1])) {
        vars.add(match[1]);
      }
    }
  });

  return Array.from(vars).sort();
});

const autoVarsDisplay = computed(() => {
  const now = new Date();
  return {
    date: now.toLocaleDateString('zh-CN'),
    time: now.toLocaleTimeString('zh-CN'),
    datetime: now.toLocaleString('zh-CN'),
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0'),
  };
});

function openCreateModal() {
  editingTemplate.value = null;
  form.name = '';
  form.title = '';
  form.content = '';
  form.url = '';
  form.useMarkdown = false;
  form.category = '';
  form.channels = [];
  Object.keys(variableValues).forEach((key) => delete variableValues[key]);
  showModal.value = true;
}

function editTemplate(tpl: PushTemplate) {
  editingTemplate.value = tpl;
  form.name = tpl.name;
  form.title = tpl.title;
  form.content = tpl.content;
  form.url = tpl.url || '';
  form.useMarkdown = tpl.useMarkdown || false;
  form.category = tpl.category || '';
  form.channels = tpl.channels ? [...tpl.channels] : [];

  if (tpl.variables) {
    for (const v of tpl.variables) {
      variableValues[v.key] = v.defaultValue || '';
    }
  }

  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingTemplate.value = null;
  Object.keys(variableValues).forEach((key) => delete variableValues[key]);
}

function useTemplate(tpl: PushTemplate) {
  emit('use-template', tpl);
}

function confirmDelete(tpl: PushTemplate) {
  deletingTemplate.value = tpl;
  showDeleteConfirm.value = true;
}

function toggleSelect(templateId: string) {
  const newSet = new Set(selectedTemplateIds.value);
  if (newSet.has(templateId)) {
    newSet.delete(templateId);
  } else {
    newSet.add(templateId);
  }
  selectedTemplateIds.value = newSet;
}

function clearSelection() {
  selectedTemplateIds.value = new Set();
}

function confirmBatchDelete() {
  showBatchDeleteConfirm.value = true;
}

async function doBatchDelete() {
  if (!props.accessToken || selectedTemplateIds.value.size === 0) return;
  deleting.value = true;

  try {
    const deletePromises = Array.from(selectedTemplateIds.value).map((id) =>
      deleteTemplate(props.accessToken, id)
    );
    await Promise.all(deletePromises);

    templates.value = templates.value.filter((t) => !selectedTemplateIds.value.has(t.id));
    selectedTemplateIds.value = new Set();
    showBatchDeleteConfirm.value = false;
    showToast(t('message.batch_delete_success'), 'success');
  } catch (_err) {
    showToast((_err as Error).message || t('message.batch_delete_failed'), 'error');
  } finally {
    deleting.value = false;
  }
}

async function doDelete() {
  if (!props.accessToken || !deletingTemplate.value) return;
  deleting.value = true;
  try {
    await deleteTemplate(props.accessToken, deletingTemplate.value.id);
    templates.value = templates.value.filter((t) => t.id !== deletingTemplate.value!.id);
    showDeleteConfirm.value = false;
    deletingTemplate.value = null;
  } catch (_err) {
    showToast((_err as Error).message, 'error');
  } finally {
    deleting.value = false;
  }
}

async function loadAndPreview() {
  if (!editingTemplate.value?.id) return;

  previewLoading.value = true;
  previewResult.value = { title: '', content: '', url: '' };

  try {
    const { previewTemplate } = await import('@/api');
    const result = await previewTemplate(props.accessToken, editingTemplate.value.id, {
      variables: { ...variableValues },
    });
    previewResult.value = result;
  } catch (err: unknown) {
    showToast((err as Error).message || t('message.preview_failed'), 'error');
  } finally {
    previewLoading.value = false;
  }
}

watch(showPreview, (val) => {
  if (val) {
    loadAndPreview();
  }
});

async function saveTemplate() {
  if (!props.accessToken || !form.name || !form.title) return;
  saving.value = true;
  try {
    const variables = detectedVariables.value.map((key) => ({
      key,
      defaultValue: variableValues[key] || '',
      description: t('label.variable_description', { variable: key }),
    }));

    const templateData = {
      name: form.name,
      title: form.title,
      content: form.content,
      url: form.url || undefined,
      useMarkdown: form.useMarkdown,
      category: form.category || undefined,
      channels: form.channels.length > 0 ? form.channels : undefined,
      variables,
    };

    if (editingTemplate.value) {
      const result = await updateTemplate(
        props.accessToken,
        editingTemplate.value.id,
        templateData
      );
      const index = templates.value.findIndex((t) => t.id === editingTemplate.value!.id);
      if (index !== -1) {
        templates.value[index] = result.template;
      }
    } else {
      const result = await createTemplate(props.accessToken, templateData);
      templates.value.push(result.template);
    }
    closeModal();
  } catch (_err) {
    alert((_err as Error).message);
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
  } catch (_err) {
    console.error('加载模板失败:', _err);
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

.panel-header .header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-count {
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-panel, white);
  transition: border-color 0.3s;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
}

.category-select {
  min-width: 150px;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-panel, white);
  cursor: pointer;
}

.category-select:focus {
  outline: none;
  border-color: #667eea;
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
  gap: 16px;
}

.template-card {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  background: white;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  transition: all 0.25s ease;
  overflow: hidden;
}

.template-card:hover {
  border-color: #e0e0e0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.template-card:has(.template-select input:checked) {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
}

.template-select {
  display: flex;
  align-items: flex-start;
  padding: 24px 12px 24px 24px;
}

.template-select input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.template-main {
  flex: 1;
  min-width: 0;
  padding: 24px;
}

.template-top {
  margin-bottom: 16px;
}

.template-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.template-name {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}

.template-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 20px;
  font-weight: 500;
}

.tag-markdown {
  background: #f5f5f5;
  color: #888;
}

.tag-channel {
  background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
  color: #667eea;
}

.tag-category {
  background: #e0f7fa;
  color: #00838f;
}

.template-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
}

.field-label {
  color: #999;
  min-width: 40px;
  flex-shrink: 0;
}

.field-value {
  color: #333;
}

.field-content {
  color: #666;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.field-url {
  color: #667eea;
  word-break: break-all;
}

.template-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  padding: 20px;
  border-left: 1px solid #f5f5f5;
  background: #fafafa;
}

.action-btn {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  text-align: center;
  min-width: 60px;
}

.action-use {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px 8px 0 0;
}

.action-use:hover {
  opacity: 0.9;
}

.action-edit {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border-top: 1px solid #d97706;
  border-bottom: 1px solid #d97706;
}

.action-edit:hover {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
}

.action-delete {
  background: #ff4757;
  color: white;
  border-radius: 0 0 8px 8px;
}

.action-delete:hover {
  background: #ff3742;
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

.modal-large {
  max-width: 720px;
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

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  height: 30px;
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

.btn-outline {
  background: transparent;
  color: var(--text-primary, #333);
  border: 1px solid var(--border-color, #e0e0e0);
}

.btn-outline:hover {
  border-color: #667eea;
  color: #667eea;
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
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.variable-hint {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin: 4px 0 0;
}

.variable-hint code {
  background: var(--bg-secondary, #f0f0f0);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
}

.variables-section {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.variables-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.variables-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variable-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.variable-key {
  font-family: monospace;
  font-size: 12px;
  background: var(--bg-panel, white);
  padding: 4px 8px;
  border-radius: 4px;
  color: #667eea;
  min-width: 80px;
  text-align: center;
}

.variable-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 13px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
}

.variable-input:focus {
  outline: none;
  border-color: #667eea;
}

.variables-empty {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.variables-empty code {
  background: var(--bg-panel, white);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #667eea;
}

.preview-section {
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.preview-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-primary, #333);
}

.preview-item {
  margin-bottom: 12px;
}

.preview-item label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  margin-bottom: 4px;
}

.preview-value {
  font-size: 14px;
  color: var(--text-primary, #333);
  margin: 0;
  line-height: 1.5;
}

.preview-content {
  white-space: pre-wrap;
  background: var(--bg-panel, white);
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.preview-url {
  color: #667eea;
  word-break: break-all;
}

.preview-auto-vars {
  background: #f0f4ff;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #d0d9ff;
}

.preview-auto-vars h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-primary, #333);
}

.auto-vars-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.auto-var {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  background: var(--bg-panel, white);
  padding: 6px 10px;
  border-radius: 4px;
}

.auto-var code {
  font-family: monospace;
  color: #667eea;
  min-width: 90px;
}

.auto-var-value {
  color: var(--text-secondary, #666);
  font-family: monospace;
}

.preview-loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, #666);
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .panel-header .header-actions {
    width: 100%;
    flex-wrap: wrap;
    gap: 8px;
  }

  .panel-header h2 {
    font-size: 16px;
  }

  .selected-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .filter-bar {
    flex-direction: column;
    gap: 10px;
  }

  .category-select {
    width: 100%;
  }

  .template-card {
    flex-direction: column;
  }

  .template-select {
    padding: 12px 16px 0;
  }

  .template-main {
    padding: 16px;
  }

  .modal-large {
    width: 95%;
    max-width: 100%;
  }

  .modal {
    width: 95%;
    max-width: 100%;
    margin: 16px;
  }

  .modal-header {
    padding: 12px 16px;
  }

  .modal-body {
    padding: 16px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    font-size: 13px;
  }

  .form-group input,
  .form-group textarea {
    padding: 8px 12px;
    font-size: 13px;
  }

  .channels-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .channel-checkbox {
    padding: 6px 10px;
  }

  .form-actions {
    flex-direction: column;
    gap: 8px;
  }

  .form-actions .btn {
    width: 100%;
  }

  .auto-vars-grid {
    grid-template-columns: 1fr;
  }

  .variables-header {
    flex-direction: column;
    gap: 8px;
  }

  .variable-item {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .variable-key {
    min-width: auto;
    text-align: left;
  }

  .template-item {
    padding: 12px;
  }

  .template-header {
    flex-direction: column;
    gap: 8px;
  }

  .template-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .template-actions {
    flex-direction: column;
    gap: 4px;
  }

  .template-actions .btn {
    width: 100%;
  }

  .preview-section {
    padding: 12px;
  }

  .preview-item {
    margin-bottom: 8px;
  }

  .template-channels {
    flex-wrap: wrap;
  }

  .channel-tag {
    font-size: 10px;
    padding: 3px 6px;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 14px;
  }

  .modal-header h3 {
    font-size: 14px;
  }

  .btn-sm {
    padding: 5px 10px;
    font-size: 11px;
  }

  .template-name {
    font-size: 13px;
  }

  .template-desc {
    font-size: 11px;
  }

  .channel-tag {
    font-size: 9px;
    padding: 2px 5px;
  }

  .template-channels {
    gap: 4px;
  }

  .variable-hint {
    font-size: 11px;
  }

  .variable-key {
    font-size: 11px;
  }

  .variable-input {
    font-size: 12px;
    padding: 4px 8px;
  }
}

/* 深色主题样式 */
.template-manager.dark .panel {
  background: #1e1e2e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.template-manager.dark .panel-header {
  border-bottom-color: #313244;
}

.template-manager.dark .search-input,
.template-manager.dark .category-select {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.template-manager.dark .search-input:focus,
.template-manager.dark .category-select:focus {
  border-color: #667eea;
}

.template-manager.dark .panel h2 {
  color: #cdd6f4;
}

.template-manager.dark .loading-state,
.template-manager.dark .empty-state {
  color: #a6adc8;
}

.template-manager.dark .template-card {
  background: #181825;
  border-color: #313244;
}

.template-manager.dark .template-card:hover {
  border-color: #45475a;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.template-manager.dark .template-name {
  color: #cdd6f4;
}

.template-manager.dark .tag-markdown {
  background: #313244;
  color: #a6adc8;
}

.template-manager.dark .tag-category {
  background: #1e1e2e;
  color: #89dceb;
}

.template-manager.dark .field-label {
  color: #6c7086;
}

.template-manager.dark .field-value {
  color: #bac2de;
}

.template-manager.dark .field-content {
  color: #a6adc8;
}

.template-manager.dark .template-actions {
  border-left-color: #313244;
  background: #1e1e2e;
}

.template-manager.dark .modal {
  background: #1e1e2e;
}

.template-manager.dark .modal-header {
  border-bottom-color: #313244;
}

.template-manager.dark .modal-header h3 {
  color: #cdd6f4;
}

.template-manager.dark .btn-close {
  color: #a6adc8;
}

.template-manager.dark .btn-close:hover {
  color: #cdd6f4;
}

.template-manager.dark .form-group label {
  color: #cdd6f4;
}

.template-manager.dark .form-group input,
.template-manager.dark .form-group textarea {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.template-manager.dark .form-group input:focus,
.template-manager.dark .form-group textarea:focus {
  border-color: #667eea;
}

.template-manager.dark .channel-checkbox {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.template-manager.dark .channel-checkbox:hover {
  border-color: #667eea;
}

.template-manager.dark .btn-secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.template-manager.dark .btn-secondary:hover {
  border-color: #667eea;
}

.template-manager.dark .btn-outline {
  color: #cdd6f4;
  border-color: #45475a;
}

.template-manager.dark .btn-outline:hover {
  border-color: #667eea;
  color: #667eea;
}

.template-manager.dark .btn-icon:hover {
  background: #313244;
}

.template-manager.dark .variable-hint {
  color: #a6adc8;
}

.template-manager.dark .variable-hint code {
  background: #313244;
}

.template-manager.dark .variables-section {
  background: #181825;
  border-color: #45475a;
}

.template-manager.dark .variables-header {
  color: #cdd6f4;
}

.template-manager.dark .variable-key {
  background: #1e1e2e;
}

.template-manager.dark .variable-input {
  border-color: #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
}

.template-manager.dark .variables-empty {
  color: #a6adc8;
}

.template-manager.dark .variables-empty code {
  background: #1e1e2e;
}

.template-manager.dark .preview-section {
  background: #181825;
}

.template-manager.dark .preview-section h4 {
  color: #cdd6f4;
}

.template-manager.dark .preview-item label {
  color: #a6adc8;
}

.template-manager.dark .preview-value {
  color: #cdd6f4;
}

.template-manager.dark .preview-content {
  background: #1e1e2e;
  border-color: #45475a;
}

.template-manager.dark .preview-auto-vars {
  background: #1e1e2e;
  border-color: #45475a;
}

.template-manager.dark .preview-auto-vars h4 {
  color: #cdd6f4;
}

.template-manager.dark .auto-var {
  background: #181825;
}

.template-manager.dark .auto-var-value {
  color: #a6adc8;
}

.template-manager.dark .preview-loading {
  color: #a6adc8;
}

.template-manager.dark .selected-count {
  color: #a6adc8;
}

.template-manager.dark .form-actions {
  border-top-color: #313244;
}
</style>
