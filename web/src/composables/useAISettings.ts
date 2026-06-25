import { ref, watch, type Ref } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import { getAITools, saveAISettings } from '@/api';
import type { AITool, UserSettings } from '@/api';

type AIToolParam = AITool['parameters'][number];
type AdminAITool = AITool & { expanded?: boolean };

export interface AISettingsOptions {
  accessToken: Ref<string>;
  userSettings: Ref<UserSettings>;
  isSavingSettings: Ref<boolean>;
  getErrorMessage: (err: unknown, fallback: string) => string;
}

const predefinedProviders = [
  {
    id: 'workers-ai',
    nameKey: 'ai.provider.workers_ai.name',
    icon: '☁️',
    descKey: 'ai.provider.workers_ai.desc',
  },
  {
    id: 'openai',
    nameKey: 'ai.provider.openai.name',
    icon: '🧠',
    descKey: 'ai.provider.openai.desc',
  },
  {
    id: 'azure-openai',
    nameKey: 'ai.provider.azure_openai.name',
    icon: '🔷',
    descKey: 'ai.provider.azure_openai.desc',
  },
  {
    id: 'anthropic',
    nameKey: 'ai.provider.anthropic.name',
    icon: '🤖',
    descKey: 'ai.provider.anthropic.desc',
  },
];

const availableIcons = ['🤖', '🧠', '⚡', '🔧', '🌟', '🎯', '🚀', '💡', '🔥', '✨'];

export function useAISettings(options: AISettingsOptions) {
  const { accessToken, userSettings, isSavingSettings, getErrorMessage } = options;
  const t = useTranslation();
  const { showToast } = useGlobalToast();

  // ==================== AI 工具栏相关 ====================
  const aiTools = ref<AdminAITool[]>([]);
  const showAddToolModal = ref(false);
  const showEditToolModal = ref(false);
  const newToolName = ref('');
  const newToolDescription = ref('');
  const editingToolId = ref('');
  const editingTool = ref<AdminAITool | null>(null);

  // ==================== 自定义 AI 提供商相关 ====================
  const showAddProviderModal = ref(false);
  const newProviderName = ref('');
  const newProviderIcon = ref('🤖');
  const showEditProviderModal = ref(false);
  const editingProviderId = ref('');
  const editingProviderName = ref('');
  const editingProviderIcon = ref('🤖');

  // 自动加载提供商配置：当 ai_provider 变化或 settings 首次加载时
  let _lastProvider = '';
  watch(
    () => userSettings.value.ai_provider,
    (newProvider) => {
      if (newProvider && newProvider !== _lastProvider) {
        _lastProvider = newProvider;
        loadProviderConfig(newProvider);
      }
    },
    { immediate: true }
  );

  // ==================== 工具函数 ====================

  async function loadAITools() {
    try {
      const result = await getAITools(accessToken.value);
      if (result.success) {
        aiTools.value = result.tools;
      }
    } catch (err) {
      console.error('加载 AI 工具失败:', err);
    }
  }

  function getToolPrompt(tool: AITool): string {
    const paramsStr =
      tool.parameters && tool.parameters.length > 0
        ? JSON.stringify(
            tool.parameters.map((p: AIToolParam) => ({
              name: p.name,
              type: p.type,
              description: p.description,
              required: p.required,
            }))
          )
        : '[]';

    return `{"name":"${tool.name}","description":"${tool.description}","parameters":${paramsStr}}`;
  }

  function getToolDisplayName(tool: AITool): string {
    const key = `ai.tool.${tool.name}.name`;
    const translated = t(key);
    return translated === key ? tool.name : translated;
  }

  function getToolDisplayDescription(tool: AITool): string {
    const key = `ai.tool.${tool.name}.desc`;
    const translated = t(key);
    return translated === key ? tool.description : translated;
  }

  function getParamTypeLabel(type: string): string {
    const key = `ai.type.${String(type || '').toLowerCase()}`;
    const translated = t(key);
    return translated === key ? type : translated;
  }

  function getParamDisplayName(param: AIToolParam): string {
    const key = `ai.param.${param.name}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return param.description || param.name;
  }

  function editTool(tool: AdminAITool) {
    editingToolId.value = tool.id;
    editingTool.value = { ...tool };
    showEditToolModal.value = true;
  }

  function deleteTool(toolId: string) {
    aiTools.value = aiTools.value.filter((t) => t.id !== toolId);
    saveAITools();
  }

  async function handleToggleTool(_tool: AITool) {
    await saveAITools();
  }

  async function saveAITools() {
    try {
      const result = await saveAISettings(accessToken.value, {
        ai_tools: aiTools.value.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          parameters: t.parameters || [],
          enabled: t.enabled,
        })),
      });
      if (result.success) {
        showToast(t('toast.tool_saved'), 'success');
      }
    } catch (err) {
      console.error('保存 AI 工具失败:', err);
      showToast(t('toast.save_failed'), 'error');
    }
  }

  function addTool() {
    if (!newToolName.value.trim()) {
      showToast(t('toast.enter_tool_name'), 'error');
      return;
    }

    const tool = {
      id: `custom_${Date.now()}`,
      name: newToolName.value.trim(),
      description: newToolDescription.value.trim(),
      parameters: [],
      enabled: true,
      isDefault: false,
    };

    aiTools.value.push(tool);
    newToolName.value = '';
    newToolDescription.value = '';
    showAddToolModal.value = false;

    saveAITools();
    showToast(t('toast.tool_added'), 'success');
  }

  function updateTool() {
    if (!editingTool.value) return;

    const index = aiTools.value.findIndex((t) => t.id === editingToolId.value);
    if (index !== -1) {
      aiTools.value[index] = { ...editingTool.value };
    }

    showEditToolModal.value = false;
    editingToolId.value = '';
    editingTool.value = null;

    saveAITools();
    showToast(t('toast.tool_updated'), 'success');
  }

  // ==================== 提供商配置函数 ====================

  function getDefaultApiUrlForProvider(provider: string) {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'azure-openai':
        return 'https://{your-resource-name}.openai.azure.com/openai/deployments/{deployment-name}/chat/completions?api-version=2024-02-15-preview';
      case 'anthropic':
        return 'https://api.anthropic.com/v1/messages';
      case 'workers-ai':
        return '';
      case 'custom':
        return 'https://api.example.com/v1/chat/completions';
      default:
        return 'https://api.example.com/v1/chat/completions';
    }
  }

  function getDefaultModelNameForProvider(provider: string) {
    switch (provider) {
      case 'openai':
        return 'gpt-4';
      case 'azure-openai':
        return 'gpt-4';
      case 'anthropic':
        return 'claude-3-opus';
      case 'workers-ai':
        return '@cf/meta/llama-3-8b-instruct';
      case 'custom':
        return 'gpt-4';
      default:
        return 'gpt-4';
    }
  }

  function saveProviderConfig(provider: string) {
    if (!userSettings.value.ai_provider_configs) {
      userSettings.value.ai_provider_configs = {};
    }

    userSettings.value.ai_provider_configs[
      provider as keyof typeof userSettings.value.ai_provider_configs
    ] = {
      api_key: userSettings.value.ai_api_key,
      api_url: userSettings.value.ai_api_url,
      model_name: userSettings.value.ai_model_name,
    };
  }

  function loadProviderConfig(provider: string) {
    const config =
      userSettings.value.ai_provider_configs?.[
        provider as keyof typeof userSettings.value.ai_provider_configs
      ];

    if (config) {
      userSettings.value.ai_api_key = config.api_key || '';
      userSettings.value.ai_api_url = config.api_url || getDefaultApiUrlForProvider(provider);
      userSettings.value.ai_model_name =
        config.model_name || getDefaultModelNameForProvider(provider);
    } else {
      userSettings.value.ai_api_key = '';
      userSettings.value.ai_api_url = getDefaultApiUrlForProvider(provider);
      userSettings.value.ai_model_name = getDefaultModelNameForProvider(provider);
    }
  }

  async function selectProvider(provider: string) {
    if (isSavingSettings.value) return;

    const oldProvider = userSettings.value.ai_provider;

    if (oldProvider) {
      saveProviderConfig(oldProvider);
    }

    const config =
      userSettings.value.ai_provider_configs?.[
        provider as keyof typeof userSettings.value.ai_provider_configs
      ];
    const apiKey = config?.api_key || '';

    const isWorkersAI = provider === 'workers-ai';
    const apiUrl = isWorkersAI ? '' : config?.api_url || getDefaultApiUrlForProvider(provider);
    const modelName = config?.model_name || getDefaultModelNameForProvider(provider);

    const requestData = {
      ai_enabled: userSettings.value.ai_enabled,
      ai_provider: provider,
      ai_model: provider,
      ai_api_key: apiKey,
      ai_api_url: apiUrl,
      ai_model_name: modelName,
      ai_provider_configs: userSettings.value.ai_provider_configs,
      custom_ai_providers: userSettings.value.custom_ai_providers,
      ai_tools: aiTools.value.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        parameters: t.parameters || [],
        enabled: t.enabled,
      })),
    };

    isSavingSettings.value = true;
    try {
      await saveAISettings(accessToken.value, requestData);
      userSettings.value.ai_provider = provider;
      loadProviderConfig(provider);
    } catch {
      showToast(t('toast.switch_failed'), 'error');
    } finally {
      isSavingSettings.value = false;
    }
  }

  function getProviderConfigTitle() {
    const provider = userSettings.value.ai_provider;
    const customProvider = userSettings.value.custom_ai_providers?.find((p) => p.id === provider);
    if (customProvider) {
      return `${customProvider.name} ${t('config.title.suffix')}`;
    }
    switch (provider) {
      case 'openai':
        return t('config.title.openai');
      case 'azure-openai':
        return t('config.title.azure_openai');
      case 'anthropic':
        return t('config.title.anthropic');
      case 'custom':
        return t('config.title.custom');
      default:
        return '';
    }
  }

  // ==================== 自定义提供商管理函数 ====================

  function isCustomProvider(providerId: string) {
    return !!userSettings.value.custom_ai_providers?.find((p) => p.id === providerId);
  }

  async function saveCustomProviders() {
    if (isSavingSettings.value) return;

    if (userSettings.value.ai_provider) {
      saveProviderConfig(userSettings.value.ai_provider);
    }

    isSavingSettings.value = true;
    try {
      const result = await saveAISettings(accessToken.value, {
        ai_enabled: userSettings.value.ai_enabled,
        ai_provider: userSettings.value.ai_provider,
        ai_model: userSettings.value.ai_provider,
        ai_api_key: userSettings.value.ai_api_key,
        ai_api_url: userSettings.value.ai_api_url,
        ai_model_name: userSettings.value.ai_model_name,
        ai_provider_configs: userSettings.value.ai_provider_configs,
        custom_ai_providers: userSettings.value.custom_ai_providers,
        ai_tools: aiTools.value.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          parameters: t.parameters || [],
          enabled: t.enabled,
        })),
      });
      if (result.success) {
        showToast(t('toast.settings_saved'), 'success');
      }
    } catch (err: unknown) {
      showToast(getErrorMessage(err, t('toast.save_failed')), 'error');
    } finally {
      isSavingSettings.value = false;
    }
  }

  function addCustomProvider() {
    if (!newProviderName.value.trim()) {
      showToast(t('toast.enter_provider_name'), 'error');
      return;
    }

    const providerId = `custom-${Date.now()}`;
    const newProvider = {
      id: providerId,
      name: newProviderName.value.trim(),
      icon: newProviderIcon.value,
    };

    if (!userSettings.value.custom_ai_providers) {
      userSettings.value.custom_ai_providers = [];
    }
    userSettings.value.custom_ai_providers.push(newProvider);

    newProviderName.value = '';
    newProviderIcon.value = '🤖';
    showAddProviderModal.value = false;

    saveCustomProviders();
    showToast(t('toast.provider_added'), 'success');
  }

  function startEditProvider(providerId: string, event: Event) {
    event.stopPropagation();

    const provider = userSettings.value.custom_ai_providers?.find((p) => p.id === providerId);
    if (provider) {
      editingProviderId.value = providerId;
      editingProviderName.value = provider.name;
      editingProviderIcon.value = provider.icon;
      showEditProviderModal.value = true;
    }
  }

  function saveEditProvider() {
    if (!editingProviderName.value.trim()) {
      showToast(t('toast.enter_provider_name'), 'error');
      return;
    }

    const provider = userSettings.value.custom_ai_providers?.find(
      (p) => p.id === editingProviderId.value
    );
    if (provider) {
      provider.name = editingProviderName.value.trim();
      provider.icon = editingProviderIcon.value;
    }

    showEditProviderModal.value = false;
    editingProviderId.value = '';
    editingProviderName.value = '';
    editingProviderIcon.value = '🤖';

    saveCustomProviders();
    showToast(t('toast.provider_updated'), 'success');
  }

  function deleteCustomProvider(providerId: string, event: Event) {
    event.stopPropagation();

    if (userSettings.value.ai_provider === providerId) {
      showToast(t('toast.cannot_delete_current_provider'), 'error');
      return;
    }

    userSettings.value.custom_ai_providers =
      userSettings.value.custom_ai_providers?.filter((p) => p.id !== providerId) || [];

    if (userSettings.value.ai_provider_configs) {
      delete userSettings.value.ai_provider_configs[providerId];
    }

    saveCustomProviders();
    showToast(t('toast.provider_deleted'), 'success');
  }

  async function handleSaveAISettings() {
    if (isSavingSettings.value) return;

    if (userSettings.value.ai_enabled) {
      if (!userSettings.value.ai_provider) {
        showToast(t('toast.select_ai_provider'), 'error');
        return;
      }

      if (!userSettings.value.ai_model_name?.trim()) {
        showToast(t('toast.enter_model_name'), 'error');
        return;
      }

      if (userSettings.value.ai_provider !== 'workers-ai') {
        if (!userSettings.value.ai_api_key?.trim()) {
          showToast(t('toast.enter_api_key'), 'error');
          return;
        }
        if (
          (userSettings.value.ai_provider === 'azure-openai' ||
            isCustomProvider(userSettings.value.ai_provider)) &&
          !userSettings.value.ai_api_url?.trim()
        ) {
          showToast(t('toast.enter_api_url'), 'error');
          return;
        }
      }
    }

    if (userSettings.value.ai_provider) {
      saveProviderConfig(userSettings.value.ai_provider);
    }

    isSavingSettings.value = true;
    try {
      const result = await saveAISettings(accessToken.value, {
        ai_enabled: userSettings.value.ai_enabled,
        ai_provider: userSettings.value.ai_provider,
        ai_model: userSettings.value.ai_provider,
        ai_api_key: userSettings.value.ai_api_key,
        ai_api_url: userSettings.value.ai_api_url,
        ai_model_name: userSettings.value.ai_model_name,
        ai_provider_configs: userSettings.value.ai_provider_configs,
        custom_ai_providers: userSettings.value.custom_ai_providers,
        ai_tools: aiTools.value.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          parameters: t.parameters || [],
          enabled: t.enabled,
        })),
      });
      if (result.success) {
        showToast(result.message, 'success');
      }
    } catch (err: unknown) {
      showToast(getErrorMessage(err, t('msg.operation_failed')), 'error');
    } finally {
      isSavingSettings.value = false;
    }
  }

  return {
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
    saveAITools,
    addTool,
    updateTool,
    selectProvider,
    saveProviderConfig,
    loadProviderConfig,
    getDefaultApiUrlForProvider,
    getDefaultModelNameForProvider,
    getProviderConfigTitle,
    isCustomProvider,
    saveCustomProviders,
    addCustomProvider,
    startEditProvider,
    saveEditProvider,
    deleteCustomProvider,
    handleSaveAISettings,
  };
}

export type { AdminAITool, AIToolParam };
