<template>
  <div class="workflow-manager" :class="{ dark: isDark }">
    <div class="panel">
      <div class="panel-header">
        <h2>⚡ {{ t('workflows.title') }}</h2>
        <button class="btn btn-primary" @click="openCreateModal" :disabled="saving">
          + {{ t('workflows.create') }}
        </button>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('label.loading') }}</span>
      </div>

      <div v-else-if="workflows.length === 0" class="empty-state">
        <div class="empty-icon">⚡</div>
        <p>{{ t('workflows.empty') }}</p>
        <button class="btn btn-primary" @click="openCreateModal">
          {{ t('workflows.createFirst') }}
        </button>
      </div>

      <div v-else class="workflow-list">
        <div v-for="wf in workflows" :key="wf.id" class="workflow-card">
          <div class="workflow-info">
            <div class="workflow-header">
              <h3 class="workflow-name">{{ wf.name }}</h3>
              <div class="workflow-tags">
                <span :class="['tag', wf.enabled ? 'tag-enabled' : 'tag-disabled']">
                  {{ wf.enabled ? t('label.enabled') : t('label.disabled') }}
                </span>
                <span v-if="wf.lastStatus" :class="['tag', `tag-${wf.lastStatus}`]">
                  {{ wf.lastStatus }}
                </span>
                <span class="tag tag-steps">{{ wf.steps.length }} {{ t('workflows.steps') }}</span>
              </div>
            </div>
            <p v-if="wf.description" class="workflow-desc">{{ wf.description }}</p>
            <div class="workflow-meta">
              <span v-if="wf.lastRunAt" class="meta-item">
                {{ t('workflows.lastRun') }}: {{ formatTime(wf.lastRunAt) }}
              </span>
              <span class="meta-item">
                {{ t('label.createdAt') }}: {{ formatTime(wf.createdAt) }}
              </span>
            </div>
          </div>
          <div class="workflow-actions">
            <button
              class="action-btn action-execute"
              :disabled="!wf.enabled || executing === wf.id"
              @click="executeWf(wf)"
            >
              {{ executing === wf.id ? t('label.executing') : t('workflows.execute') }}
            </button>
            <button class="action-btn action-edit" @click="editWorkflow(wf)">
              {{ t('button.edit') }}
            </button>
            <button class="action-btn action-delete" @click="confirmDelete(wf)">
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建/编辑模态框 -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>{{ editingWorkflow ? t('workflows.edit') : t('workflows.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>
        <form @submit.prevent="saveWorkflow" class="modal-body">
          <div class="form-group">
            <label>{{ t('workflows.name') }} *</label>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('workflows.namePlaceholder')"
              required
            />
          </div>
          <div class="form-group">
            <label>{{ t('workflows.description') }}</label>
            <textarea
              v-model="form.description"
              :placeholder="t('workflows.descriptionPlaceholder')"
              rows="2"
            ></textarea>
          </div>

          <div class="form-group">
            <label>{{ t('workflows.steps') }} *</label>
            <div class="steps-list">
              <div v-for="(step, index) in form.steps" :key="index" class="step-item">
                <div class="step-header">
                  <span class="step-number">{{ index + 1 }}</span>
                  <select v-model="step.type" class="step-type-select">
                    <option value="push">{{ t('workflows.stepPush') }}</option>
                    <option value="delay">{{ t('workflows.stepDelay') }}</option>
                    <option value="condition">{{ t('workflows.stepCondition') }}</option>
                  </select>
                  <button type="button" class="btn-icon" @click="removeStep(index)">✕</button>
                </div>

                <div v-if="step.type === 'push'" class="step-config">
                  <input
                    v-model="(step.config as { title?: string }).title"
                    type="text"
                    :placeholder="t('workflows.pushTitle')"
                    class="step-input"
                  />
                  <textarea
                    v-model="(step.config as { body?: string }).body"
                    :placeholder="t('workflows.pushBody')"
                    rows="2"
                    class="step-input"
                  ></textarea>
                  <div class="step-channels">
                    <label v-for="ch in allChannels" :key="ch.id" class="channel-checkbox">
                      <input
                        type="checkbox"
                        :value="ch.id"
                        v-model="(step.config as { channels?: string[] }).channels"
                      />
                      <span>{{ ch.icon }} {{ ch.name }}</span>
                    </label>
                  </div>
                </div>

                <div v-else-if="step.type === 'delay'" class="step-config">
                  <div class="delay-input">
                    <label>{{ t('workflows.delaySeconds') }}</label>
                    <input
                      v-model.number="(step.config as { seconds?: number }).seconds"
                      type="number"
                      min="1"
                      max="300"
                      placeholder="5"
                      class="step-input step-input-small"
                    />
                  </div>
                </div>

                <div v-else class="step-config">
                  <input
                    v-model="(step.config as { expression?: string }).expression"
                    type="text"
                    :placeholder="t('workflows.conditionExpression')"
                    class="step-input"
                  />
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" @click="addStep">
              + {{ t('workflows.addStep') }}
            </button>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.enabled" />
              <span>{{ t('workflows.enabled') }}</span>
            </label>
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

    <!-- 删除确认模态框 -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('workflows.confirmDelete') }}</h3>
          <button class="btn-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ t('workflows.deleteConfirm', { name: deletingWorkflow?.name }) }}</p>
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

    <!-- 执行结果模态框 -->
    <div v-if="showExecuteResult" class="modal-overlay" @click.self="showExecuteResult = false">
      <div class="modal modal-medium">
        <div class="modal-header">
          <h3>{{ t('workflows.executeResult') }}</h3>
          <button class="btn-close" @click="showExecuteResult = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="execute-results">
            <div
              v-for="result in executeResults"
              :key="result.step"
              :class="['result-item', `result-${result.status}`]"
            >
              <span class="result-step">{{ t('workflows.step') }} {{ result.step }}</span>
              <span class="result-status">{{ result.status }}</span>
              <span class="result-message">{{ result.message }}</span>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showExecuteResult = false">
              {{ t('button.close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { t } from '@/i18n';
import { useThemeStore } from '@/stores/theme';
import { useGlobalToast } from '@/composables/useToast';
import {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  executeWorkflow,
  type PushWorkflow,
  type WorkflowStep,
  type PushChannel,
  type ChannelConfig,
} from '@/api';

const { showToast } = useGlobalToast();

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const props = defineProps<{
  accessToken: string;
  channels: ChannelConfig[];
}>();

const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const executing = ref<string | null>(null);
const showModal = ref(false);
const showDeleteConfirm = ref(false);
const showExecuteResult = ref(false);
const editingWorkflow = ref<PushWorkflow | null>(null);
const deletingWorkflow = ref<PushWorkflow | null>(null);
const workflows = ref<PushWorkflow[]>([]);
const executeResults = ref<Array<{ step: number; status: string; message: string }>>([]);

const allChannels = computed(() => {
  return props.channels
    .filter((c) => c.enabled)
    .map((c) => ({
      id: c.id,
      name: t(`channel.${c.id}`) || c.id,
      icon: c.icon,
    }));
});

const form = reactive({
  name: '',
  description: '',
  steps: [] as Array<{ type: string; config: Record<string, unknown> }>,
  enabled: true,
});

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN');
}

function openCreateModal() {
  editingWorkflow.value = null;
  form.name = '';
  form.description = '';
  form.steps = [{ type: 'push', config: { title: '', body: '', channels: [] } }];
  form.enabled = true;
  showModal.value = true;
}

function editWorkflow(wf: PushWorkflow) {
  editingWorkflow.value = wf;
  form.name = wf.name;
  form.description = wf.description;
  form.steps = wf.steps.map((s) => ({
    type: s.type,
    config: { ...s.config },
  }));
  form.enabled = wf.enabled;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingWorkflow.value = null;
}

function addStep() {
  form.steps.push({ type: 'push', config: { title: '', body: '', channels: [] } });
}

function removeStep(index: number) {
  form.steps.splice(index, 1);
}

async function saveWorkflow() {
  if (!props.accessToken || !form.name || form.steps.length === 0) return;
  saving.value = true;

  try {
    const steps: WorkflowStep[] = form.steps.map((s) => ({
      type: s.type as WorkflowStep['type'],
      config: s.config,
    }));

    if (editingWorkflow.value) {
      await updateWorkflow(props.accessToken, editingWorkflow.value.id, {
        name: form.name,
        description: form.description,
        steps,
        enabled: form.enabled,
      });
    } else {
      await createWorkflow(props.accessToken, {
        name: form.name,
        description: form.description,
        steps,
        enabled: form.enabled,
      });
    }
    closeModal();
    await loadWorkflows();
  } catch (err) {
    showToast((err as Error).message, 'error');
  } finally {
    saving.value = false;
  }
}

function confirmDelete(wf: PushWorkflow) {
  deletingWorkflow.value = wf;
  showDeleteConfirm.value = true;
}

async function doDelete() {
  if (!props.accessToken || !deletingWorkflow.value) return;
  deleting.value = true;
  try {
    await deleteWorkflow(props.accessToken, deletingWorkflow.value.id);
    workflows.value = workflows.value.filter((w) => w.id !== deletingWorkflow.value!.id);
    showDeleteConfirm.value = false;
    deletingWorkflow.value = null;
    showToast(t('message.delete_success'), 'success');
  } catch (err) {
    showToast((err as Error).message, 'error');
  } finally {
    deleting.value = false;
  }
}

async function executeWf(wf: PushWorkflow) {
  if (!props.accessToken) return;
  executing.value = wf.id;
  try {
    const result = await executeWorkflow(props.accessToken, wf.id);
    executeResults.value = result.results || [];
    showExecuteResult.value = true;
    await loadWorkflows();
    showToast(
      result.success ? t('workflows.executeSuccess') : t('workflows.executePartial'),
      result.success ? 'success' : 'warning'
    );
  } catch (err) {
    showToast((err as Error).message, 'error');
  } finally {
    executing.value = null;
  }
}

async function loadWorkflows() {
  if (!props.accessToken) return;
  loading.value = true;
  try {
    const data = await getWorkflows(props.accessToken);
    workflows.value = data.workflows || [];
  } catch (err) {
    console.error('加载工作流失败:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadWorkflows);
</script>

<style scoped>
.workflow-manager {
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

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workflow-card {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  background: white;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  transition: all 0.25s ease;
  overflow: hidden;
}

.workflow-card:hover {
  border-color: #e0e0e0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.workflow-info {
  flex: 1;
  padding: 24px;
}

.workflow-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.workflow-name {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}

.workflow-tags {
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

.tag-enabled {
  background: #e8f5e9;
  color: #2e7d32;
}

.tag-disabled {
  background: #fce4ec;
  color: #c62828;
}

.tag-success {
  background: #e8f5e9;
  color: #2e7d32;
}

.tag-failed {
  background: #fce4ec;
  color: #c62828;
}

.tag-steps {
  background: #e3f2fd;
  color: #1565c0;
}

.workflow-desc {
  font-size: 14px;
  color: #666;
  margin: 8px 0;
}

.workflow-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #999;
}

.workflow-actions {
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
  min-width: 80px;
}

.action-execute {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px 8px 0 0;
}

.action-execute:hover:not(:disabled) {
  opacity: 0.9;
}

.action-execute:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-edit {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border-top: 1px solid #d97706;
  border-bottom: 1px solid #d97706;
}

.action-delete {
  background: #ff4757;
  color: white;
  border-radius: 0 0 8px 8px;
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
.modal-medium {
  max-width: 560px;
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
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
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
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.step-item {
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-secondary, #f8f9fa);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.step-type-select {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  background: white;
}

.step-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  background: white;
}

.step-input:focus {
  outline: none;
  border-color: #667eea;
}

.step-input-small {
  width: 100px;
}

.delay-input {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.step-channels {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  background: white;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
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
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--bg-secondary, #f8f9fa);
  color: var(--text-primary, #333);
  border: 2px solid var(--border-color, #e0e0e0);
}

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  color: #999;
}

.btn-icon:hover {
  background: #fee2e2;
  color: #ef4444;
}

.execute-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
}

.result-success {
  background: #e8f5e9;
  color: #2e7d32;
}

.result-error,
.result-failed {
  background: #fce4ec;
  color: #c62828;
}

.result-partial {
  background: #fff3e0;
  color: #e65100;
}

.result-step {
  font-weight: 600;
  min-width: 60px;
}

.result-status {
  font-weight: 500;
  min-width: 60px;
  text-transform: uppercase;
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

@media (max-width: 768px) {
  .workflow-card {
    flex-direction: column;
  }

  .workflow-actions {
    flex-direction: row;
    border-left: none;
    border-top: 1px solid #f5f5f5;
    padding: 12px;
  }

  .action-btn {
    flex: 1;
    border-radius: 6px;
  }

  .action-execute {
    border-radius: 6px;
  }
  .action-delete {
    border-radius: 6px;
  }

  .step-channels {
    grid-template-columns: 1fr;
  }
}

.workflow-manager.dark .panel {
  background: #1e1e2e;
}

.workflow-manager.dark .workflow-card {
  background: #181825;
  border-color: #313244;
}

.workflow-manager.dark .workflow-name {
  color: #cdd6f4;
}

.workflow-manager.dark .workflow-desc {
  color: #a6adc8;
}

.workflow-manager.dark .workflow-meta {
  color: #6c7086;
}

.workflow-manager.dark .workflow-actions {
  border-left-color: #313244;
  background: #1e1e2e;
}

.workflow-manager.dark .tag-disabled {
  background: #313244;
  color: #f38ba8;
}

.workflow-manager.dark .tag-enabled {
  background: #313244;
  color: #a6e3a1;
}

.workflow-manager.dark .modal {
  background: #1e1e2e;
}

.workflow-manager.dark .step-item {
  background: #181825;
  border-color: #45475a;
}

.workflow-manager.dark .step-input {
  background: #1e1e2e;
  border-color: #45475a;
  color: #cdd6f4;
}

.workflow-manager.dark .channel-checkbox {
  background: #1e1e2e;
  border-color: #45475a;
  color: #cdd6f4;
}
</style>
