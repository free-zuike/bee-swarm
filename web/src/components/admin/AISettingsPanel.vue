<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';
import { useAISettings } from '@/composables/useAISettings';
import type { UserSettings } from '@/api';
import type { Ref } from 'vue';

const props = defineProps<{
  accessToken: string;
  userSettings: Ref<UserSettings>;
  isSavingSettings: Ref<boolean>;
}>();

const emit = defineEmits<{
  (e: 'update:userSettings', value: UserSettings): void;
  (e: 'refresh'): void;
}>();

const t = useTranslation();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

const accessTokenRef = computed(() => props.accessToken);
const userSettingsRef = props.userSettings;
const isSavingSettingsRef = props.isSavingSettings;

const {
  aiTools,
  showAddToolModal,
  showEditToolModal,
  newToolName,
  newToolDescription,
  editingTool,
  showAddProviderModal,
  newProviderName,
  newProviderIcon,
  showEditProviderModal,
  editingProviderId,
  editingProviderName,
  editingProviderIcon,
  predefinedProviders,
  availableIcons,
  loadAITools,
  getToolPrompt,
  getToolDisplayName,
  getToolDisplayDescription,
  getParamTypeLabel,
  getParamDisplayName,
  editTool,
  deleteTool,
  handleToggleTool,
  updateTool,
  selectProvider,
  getDefaultApiUrlForProvider,
  getDefaultModelNameForProvider,
  getProviderConfigTitle,
  isCustomProvider,
  addCustomProvider,
  startEditProvider,
  saveEditProvider,
  deleteCustomProvider,
  handleSaveAISettings,
} = useAISettings({
  accessToken: accessTokenRef,
  userSettings: userSettingsRef,
  isSavingSettings: isSavingSettingsRef,
  getErrorMessage,
});

defineExpose({ loadAITools });

onMounted(() => {
  if (props.userSettings.value.ai_enabled) {
    loadAITools();
  }
});
</script>

<template>
  <div>
    <!-- 添加自定义 AI 提供商模态框 -->
    <Teleport to="body">
      <div
        v-if="showAddProviderModal"
        class="modal-overlay"
        @click.self="showAddProviderModal = false"
      >
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>{{ t('title.add_provider') }}</h3>
            <button class="modal-close" @click="showAddProviderModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>{{ t('label.provider_name') }}</label>
              <input
                v-model="newProviderName"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.provider_name')"
                autofocus
              />
            </div>
            <div class="form-group">
              <label>{{ t('label.select_icon') }}</label>
              <div class="icon-selector">
                <button
                  v-for="icon in availableIcons"
                  :key="icon"
                  class="icon-option"
                  :class="{ active: newProviderIcon === icon, dark: isDark }"
                  @click="newProviderIcon = icon"
                >
                  {{ icon }}
                </button>
              </div>
            </div>
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showAddProviderModal = false"
              >
                {{ t('button.cancel') }}
              </button>
              <button class="btn btn-primary" @click="addCustomProvider">
                {{ t('button.add') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 编辑自定义 AI 提供商模态框 -->
    <Teleport to="body">
      <div
        v-if="showEditProviderModal"
        class="modal-overlay"
        @click.self="showEditProviderModal = false"
      >
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>{{ t('title.edit_provider') }}</h3>
            <button class="modal-close" @click="showEditProviderModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>{{ t('label.provider_name') }}</label>
              <input
                v-model="editingProviderName"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.provider_name')"
                autofocus
              />
            </div>
            <div class="form-group">
              <label>{{ t('label.select_icon') }}</label>
              <div class="icon-selector">
                <button
                  v-for="icon in availableIcons"
                  :key="icon"
                  class="icon-option"
                  :class="{ active: editingProviderIcon === icon, dark: isDark }"
                  @click="editingProviderIcon = icon"
                >
                  {{ icon }}
                </button>
              </div>
            </div>
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showEditProviderModal = false"
              >
                {{ t('button.cancel') }}
              </button>
              <button class="btn btn-primary" @click="saveEditProvider">
                {{ t('button.save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 添加自定义 AI 工具模态框 -->
    <Teleport to="body">
      <div v-if="showAddToolModal" class="modal-overlay" @click.self="showAddToolModal = false">
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>{{ t('title.add_tool') }}</h3>
            <button class="modal-close" @click="showAddToolModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>{{ t('label.tool_name') }}</label>
              <input
                v-model="newToolName"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.tool_name')"
                autofocus
              />
            </div>
            <div class="form-group">
              <label>{{ t('label.tool_description') }}</label>
              <input
                v-model="newToolDescription"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.tool_description')"
              />
            </div>
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showAddToolModal = false"
              >
                {{ t('button.cancel') }}
              </button>
              <button class="btn btn-primary" @click="addTool">{{ t('button.add') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 编辑自定义 AI 工具模态框 -->
    <Teleport to="body">
      <div v-if="showEditToolModal" class="modal-overlay" @click.self="showEditToolModal = false">
        <div class="modal-content" :class="{ dark: isDark }">
          <div class="modal-header">
            <h3>{{ t('title.edit_tool') }}</h3>
            <button class="modal-close" @click="showEditToolModal = false">✕</button>
          </div>
          <div class="modal-body" v-if="editingTool">
            <div class="form-group">
              <label>{{ t('label.tool_name') }}</label>
              <input
                v-model="editingTool.name"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.tool_name_edit')"
                autofocus
              />
            </div>
            <div class="form-group">
              <label>{{ t('label.tool_description') }}</label>
              <input
                v-model="editingTool.description"
                type="text"
                class="form-input"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.tool_description')"
              />
            </div>
            <div class="modal-actions">
              <button
                class="btn btn-secondary"
                :class="{ dark: isDark }"
                @click="showEditToolModal = false"
              >
                {{ t('button.cancel') }}
              </button>
              <button class="btn btn-primary" @click="updateTool">{{ t('button.save') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- AI 设置面板主体 -->
    <div class="settings-panel" :class="{ dark: isDark }">
      <h3>🤖 {{ t('label.ai_settings') }}</h3>
      <div class="settings-card">
        <div class="setting-item">
          <label>{{ t('label.ai_enabled') }}</label>
          <label class="toggle">
            <input type="checkbox" v-model="userSettingsRef.ai_enabled" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <!-- AI 提供商布局 -->
      <div class="ai-provider-layout">
        <!-- 左边：AI 提供商列表 -->
        <div class="ai-provider-sidebar" :class="{ dark: isDark }">
          <div class="sidebar-header">
            <span class="sidebar-title">{{ t('label.ai_provider') }}</span>
            <div style="display: flex; gap: 8px">
              <button
                class="btn-add-provider"
                @click="showAddProviderModal = true"
                :title="t('label.add_provider')"
              >
                <span>+</span>
              </button>
            </div>
          </div>

          <div class="provider-list">
            <div
              v-for="provider in predefinedProviders"
              :key="provider.id"
              class="provider-item"
              :class="{ active: userSettingsRef.ai_provider === provider.id, dark: isDark }"
              @click="selectProvider(provider.id)"
            >
              <div class="provider-icon">{{ provider.icon }}</div>
              <div class="provider-info">
                <div class="provider-name">{{ t(provider.nameKey) }}</div>
                <div class="provider-desc">{{ t(provider.descKey) }}</div>
              </div>
              <div class="provider-check">
                <span v-if="userSettingsRef.ai_provider === provider.id">✓</span>
              </div>
            </div>

            <div
              v-for="provider in userSettingsRef.custom_ai_providers"
              :key="provider.id"
              class="provider-item"
              :class="{ active: userSettingsRef.ai_provider === provider.id, dark: isDark }"
              @click="selectProvider(provider.id)"
            >
              <div class="provider-icon">{{ provider.icon }}</div>
              <div class="provider-info">
                <div class="provider-name">{{ provider.name }}</div>
                <div class="provider-desc">{{ t('ai.provider.custom.desc') }}</div>
              </div>
              <div class="provider-actions">
                <button
                  class="edit-provider-btn"
                  @click="startEditProvider(provider.id, $event)"
                  :class="{ dark: isDark }"
                  title="编辑提供商"
                >
                  ✏️
                </button>
                <button
                  class="delete-provider-btn"
                  @click="deleteCustomProvider(provider.id, $event)"
                  :class="{ dark: isDark }"
                  title="删除提供商"
                >
                  🗑️
                </button>
              </div>
              <div class="provider-check">
                <span v-if="userSettingsRef.ai_provider === provider.id">✓</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右边：提供商配置 -->
        <div class="ai-provider-content" :class="{ dark: isDark }">
          <div v-if="!userSettingsRef.ai_provider" class="provider-empty-state">
            <p>{{ t('label.select_provider') }}</p>
          </div>

          <div v-else class="provider-config-form">
            <div class="config-header">
              <h4>{{ getProviderConfigTitle() }}</h4>
            </div>

            <div v-if="userSettingsRef.ai_provider !== 'workers-ai'" class="form-group">
              <label>{{ t('label.ai_api_key') }}</label>
              <input
                type="password"
                v-model="userSettingsRef.ai_api_key"
                class="input-sm"
                :class="{ dark: isDark }"
                :placeholder="t('placeholder.ai_api_key')"
              />
            </div>

            <div
              v-if="
                userSettingsRef.ai_provider === 'azure-openai' ||
                isCustomProvider(userSettingsRef.ai_provider)
              "
              class="form-group"
            >
              <label>{{ t('label.ai_api_url') }}</label>
              <input
                type="url"
                v-model="userSettingsRef.ai_api_url"
                class="input-sm"
                :class="{ dark: isDark }"
                :placeholder="getDefaultApiUrlForProvider(userSettingsRef.ai_provider || 'openai')"
              />
            </div>

            <div class="form-group">
              <label>{{ t('label.ai_model_name') }}</label>
              <input
                type="text"
                v-model="userSettingsRef.ai_model_name"
                class="input-sm"
                :class="{ dark: isDark }"
                :placeholder="
                  getDefaultModelNameForProvider(userSettingsRef.ai_provider || 'openai')
                "
              />
            </div>

            <div class="form-actions">
              <button
                class="btn btn-primary btn-sm"
                :class="{ dark: isDark, loading: isSavingSettingsRef }"
                @click="handleSaveAISettings"
              >
                {{ t('button.save_settings') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- AI 工具栏设置 -->
      <div class="settings-card" style="margin-top: 20px">
        <div class="card-header">
          <h4>🔧 {{ t('label.ai_tools') }}</h4>
          <button class="btn btn-sm btn-primary" @click="showAddToolModal = true">
            {{ t('button.add_tool') }}
          </button>
        </div>

        <div class="tools-list">
          <div v-for="tool in aiTools" :key="tool.id" class="tool-item">
            <div class="tool-main" @click="tool.expanded = !tool.expanded">
              <div class="tool-info">
                <div class="tool-name">
                  <span class="expand-icon">{{ tool.expanded ? '▼' : '▶' }}</span>
                  {{ getToolDisplayName(tool) }}
                  <span v-if="tool.isDefault" class="tool-badge">{{
                    t('label.tool_default')
                  }}</span>
                </div>
                <div class="tool-desc">{{ getToolDisplayDescription(tool) }}</div>
              </div>
              <div class="tool-actions" @click.stop>
                <label class="toggle">
                  <input type="checkbox" v-model="tool.enabled" @change="handleToggleTool(tool)" />
                  <span class="slider"></span>
                </label>
                <button
                  v-if="!tool.isDefault"
                  class="btn-icon"
                  @click="editTool(tool)"
                  :title="t('button.edit')"
                >
                  ✏️
                </button>
                <button
                  v-if="!tool.isDefault"
                  class="btn-icon"
                  @click="deleteTool(tool.id)"
                  :title="t('button.delete')"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div v-if="tool.expanded" class="tool-details">
              <div class="detail-section">
                <div class="detail-title">{{ t('label.tool_prompt') }}</div>
                <div class="detail-content">
                  <code class="prompt-preview">{{ getToolPrompt(tool) }}</code>
                </div>
              </div>

              <div v-if="tool.parameters && tool.parameters.length > 0" class="detail-section">
                <div class="detail-title">{{ t('label.tool_params') }}</div>
                <div class="detail-content">
                  <div v-for="param in tool.parameters" :key="param.name" class="param-item">
                    <span class="param-name">{{ getParamDisplayName(param) }}</span>
                    <span class="param-type">{{ getParamTypeLabel(param.type) }}</span>
                    <span v-if="param.required" class="param-required">{{
                      t('label.tool_required')
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="aiTools.length === 0" class="empty-state">{{ t('label.no_tools') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.2s ease;
}

.modal-content {
  background: var(--bg-panel, white);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-content.dark {
  background: var(--bg-panel, #2d2d2d);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
}

.modal-content.dark .modal-header h3 {
  color: var(--text-primary, #e0e0e0);
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary, #999);
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.modal-close:hover {
  background: var(--bg-secondary, #f0f0f0);
}

.modal-content.dark .modal-close:hover {
  background: var(--bg-secondary, #3c3c3c);
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.modal-content.dark .form-group label {
  color: var(--text-primary, #e0e0e0);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-input.dark {
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  border-color: var(--border-color, #3c3c3c);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.icon-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-option {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
  transition: all 0.2s;
}

.icon-option:hover {
  border-color: #667eea;
  transform: scale(1.1);
}

.icon-option.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.icon-option.dark {
  background: var(--bg-primary, #1e1e1e);
  border-color: var(--border-color, #3c3c3c);
}

.icon-option.dark:hover {
  border-color: #8b5cf6;
}

.icon-option.dark.active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
}

/* AI 设置面板样式 */
.settings-panel {
  animation: fadeIn 0.2s ease;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  padding: 16px;
  min-height: fit-content;
}

.settings-panel.dark {
  background: var(--bg-dark-secondary, #1e1e2e);
}

.settings-panel h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.settings-panel.dark h3 {
  color: var(--text-dark-primary, #ffffff);
}

.settings-card {
  background: var(--bg-panel, #ffffff);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color, #e8e8e8);
}

.settings-panel.dark .settings-card {
  background: var(--bg-panel, #2d2d2d);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color, #e8e8e8);
  gap: 20px;
}

.setting-item:last-of-type {
  border-bottom: none;
}

.setting-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  flex-shrink: 0;
}

.setting-item .toggle {
  margin-left: auto;
}

.setting-item .toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.setting-item .toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.setting-item .toggle .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 26px;
}

.setting-item .toggle .slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.setting-item .toggle input:checked + .slider {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.setting-item .toggle input:checked + .slider:before {
  transform: translateX(22px);
}

.settings-panel.dark .setting-item label {
  color: var(--text-dark-primary, #ffffff);
}

/* AI 提供商布局样式 */
.ai-provider-layout {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  min-height: 400px;
}

.ai-provider-sidebar {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-panel, white);
  border-radius: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-provider-sidebar.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #f8f9fa);
}

.dark .sidebar-header {
  background: var(--bg-secondary, #3c3c3c);
  border-bottom-color: var(--border-color, #4c4c4c);
}

.sidebar-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary, #1a1a2e);
}

.dark .sidebar-title {
  color: var(--text-primary, #e0e0e0);
}

.btn-add-provider {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-primary, white);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 20px;
  font-weight: bold;
  color: #667eea;
}

.btn-add-provider:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.dark .btn-add-provider {
  background: var(--bg-primary, #1e1e1e);
  border-color: var(--border-color, #4c4c4c);
}

.dark .btn-add-provider:hover {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
}

.provider-list {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.provider-list::-webkit-scrollbar {
  width: 8px;
}

.provider-list::-webkit-scrollbar-track {
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 4px;
}

.provider-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #ccc);
  border-radius: 4px;
}

.provider-list::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.dark .provider-list::-webkit-scrollbar-track {
  background: var(--bg-secondary, #3c3c3c);
}

.dark .provider-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #555);
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-primary, white);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 8px;
}

.provider-item:last-child {
  margin-bottom: 0;
}

.provider-item:hover {
  background: var(--bg-secondary, #f5f5f5);
  border-color: var(--border-color, #e0e0e0);
}

.provider-item.active {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08));
}

.provider-item.dark {
  background: var(--bg-primary, #1e1e1e);
}

.provider-item.dark:hover {
  background: var(--bg-secondary, #3c3c3c);
  border-color: var(--border-color, #4c4c4c);
}

.provider-item.dark.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.12), rgba(118, 75, 162, 0.12));
  border-color: #667eea;
}

.provider-item .provider-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  flex-shrink: 0;
}

.provider-item .provider-info {
  flex: 1;
  min-width: 0;
}

.provider-item .provider-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 2px;
}

.dark .provider-item .provider-name {
  color: var(--text-primary, #e0e0e0);
}

.provider-item .provider-desc {
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.dark .provider-item .provider-desc {
  color: var(--text-secondary, #999);
}

.provider-item .provider-check {
  font-size: 18px;
  color: #667eea;
  font-weight: bold;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.provider-item .provider-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.provider-item .edit-provider-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0.6;
  transition: all 0.2s;
}

.provider-item .edit-provider-btn:hover {
  opacity: 1;
  background: rgba(59, 130, 246, 0.1);
}

.provider-item .delete-provider-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0.6;
  transition: all 0.2s;
}

.provider-item .delete-provider-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.1);
}

.ai-provider-content {
  flex: 1;
  background: var(--bg-panel, white);
  border-radius: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  padding: 24px;
  min-width: 0;
}

.ai-provider-content.dark {
  background: var(--bg-panel, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.provider-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: var(--text-secondary, #888);
  font-size: 15px;
}

.provider-config-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-header {
  margin-bottom: 4px;
}

.config-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
}

.dark .config-header h4 {
  color: var(--text-primary, #e0e0e0);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.dark .form-group label {
  color: var(--text-primary, #ddd);
}

.form-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;
}

.form-group input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a2e);
  transition: all 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.form-group input::placeholder {
  color: var(--text-secondary, #999);
}

.ai-provider-content.dark .form-group input {
  background: var(--bg-dark-primary, #16162a);
  border-color: var(--border-dark-color, #333);
  color: var(--text-dark-primary, #ffffff);
}

.ai-provider-content.dark .form-group input::placeholder {
  color: var(--text-dark-secondary, #666);
}

.ai-provider-content.dark .form-group input:focus {
  border-color: var(--primary-color, #6366f1);
}

/* 工具栏样式 */
.tools-list {
  max-height: 450px;
  overflow-y: auto;
}

.tool-item {
  background: var(--bg-primary, white);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: all 0.2s ease;
}

.tool-item:hover {
  border-color: #e0e7ff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.tool-item:last-child {
  margin-bottom: 0;
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 4px;
  font-weight: 500;
}

.tool-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.tool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px 10px;
  font-size: 16px;
  opacity: 0.5;
  transition: all 0.2s;
  border-radius: 6px;
}

.btn-icon:hover {
  opacity: 1;
  background: var(--bg-secondary, #f0f0f0);
}

.tool-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  min-width: 0;
  padding: 14px 16px;
}

.expand-icon {
  font-size: 10px;
  color: var(--text-secondary);
  margin-right: 8px;
  transition: transform 0.2s;
}

.tool-details {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-top: 2px solid #e0e7ff;
  margin-top: 8px;
  border-radius: 0 0 8px 8px;
}

.settings-panel.dark .tool-details {
  background: linear-gradient(135deg, #1e1e2e 0%, #2d2d4a 100%);
  border-top: 2px solid #6366f1;
}

.settings-panel.dark .detail-title {
  color: var(--primary-color, #818cf8);
}

.settings-panel.dark .prompt-preview {
  background: var(--bg-primary, #1e1e1e);
  border-color: #6366f1;
  color: var(--text-primary, #e0e0e0);
}

.settings-panel.dark .param-item {
  border-bottom-color: #444;
}

.settings-panel.dark .param-name {
  color: var(--primary-color, #818cf8);
}

.settings-panel.dark .param-type {
  background: #475569;
  color: #e2e8f0;
}

.settings-panel.dark .param-required {
  background: #4c1d1d;
  color: #fca5a5;
}

.settings-panel.dark .tool-item {
  background: var(--bg-panel, #2d2d2d);
  border-color: #444;
}

.settings-panel.dark .tool-item:hover {
  border-color: #6366f1;
}

.settings-panel.dark .card-header {
  border-bottom-color: #444;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-title {
  font-size: 12px;
  font-weight: 700;
  color: #6366f1;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-title::before {
  content: '▸';
  font-size: 10px;
}

.detail-content {
  font-size: 13px;
  line-height: 1.6;
}

.prompt-preview {
  display: block;
  background: var(--bg-primary, white);
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #e0e7ff;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
}

.param-item {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #e0e7ff;
}

.param-item:last-child {
  border-bottom: none;
}

.param-name {
  font-family: monospace;
  font-weight: 600;
  color: #6366f1;
  font-size: 13px;
}

.param-type {
  font-size: 11px;
  color: white;
  background: #64748b;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.param-required {
  font-size: 10px;
  color: #ef4444;
  background: #fef2f2;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.card-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.empty-state {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary, #999);
  font-size: 13px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  height: 44px;
  box-sizing: border-box;
  line-height: 20px;
}

.btn-sm {
  padding: 8px 18px;
  font-size: 13px;
  height: 36px;
  line-height: 20px;
  box-sizing: border-box;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-primary, #333);
}

.btn-secondary:hover {
  background: var(--border-color, #e0e0e0);
}

.btn-secondary.dark {
  background: var(--bg-secondary, #3c3c3c);
  color: var(--text-primary, #e0e0e0);
}

.btn-secondary.dark:hover {
  background: var(--border-color, #4c4c4c);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
