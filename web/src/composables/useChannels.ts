/**
 * 渠道数据管理 Composable
 * 统一管理推送渠道的状态和操作
 */
import { ref, computed } from 'vue';
import type {
  ChannelConfig,
  ChannelDefinition,
  ChannelSettings,
  PushChannel,
  PushHistoryRecord,
} from '@/types';
import { showToast } from './useToast';
import { useTranslation } from '@/i18n';
import { withLoading } from '@/stores/loading';

const channelsRef = ref<ChannelConfig[]>([]);
const channelDefinitionsRef = ref<ChannelDefinition[]>([]);
const channelSettingsRef = ref<ChannelSettings>({});
const selectedChannelsRef = ref<Set<PushChannel>>(new Set());

export function useChannels() {
  const t = useTranslation();
  async function loadChannels(accessToken: string): Promise<void> {
    try {
      const { getChannelsWithToken } = await import('@/api');
      const data = await withLoading(async () => {
        return await getChannelsWithToken(accessToken);
      }, 'channels');

      channelsRef.value = data.channels;
      channelSettingsRef.value = data.settings;
      channelDefinitionsRef.value = data.definitions as ChannelDefinition[];

      restoreChannelSelection();
    } catch (err) {
      showToast(getErrorMessage(err, t('toast.load_channels_failed')), 'error');
    }
  }

  async function saveChannel(
    accessToken: string,
    channelId: string,
    fields: Record<string, string>
  ): Promise<boolean> {
    try {
      const { saveChannelWithToken } = await import('@/api');
      const result = await withLoading(async () => {
        return await saveChannelWithToken(accessToken, channelId, fields);
      }, 'saveChannel');

      channelsRef.value = result.channels;
      const data = await withLoading(async () => {
        const { getChannelsWithToken } = await import('@/api');
        return await getChannelsWithToken(accessToken);
      }, 'refreshChannels');

      channelSettingsRef.value = data.settings;
      channelDefinitionsRef.value = data.definitions as ChannelDefinition[];

      showToast(result.message || t('toast.save_success'), 'success');
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, t('toast.save_failed')), 'error');
      return false;
    }
  }

  async function toggleChannelEnabled(accessToken: string, channelId: string): Promise<boolean> {
    const key = `channel:${channelId}:enabled`;
    const current = channelSettingsRef.value[key];
    const newValue = current === 'false' ? 'true' : 'false';

    try {
      const { saveChannelWithToken, getChannelsWithToken } = await import('@/api');

      await withLoading(async () => {
        return await saveChannelWithToken(accessToken, channelId, { enabled: newValue });
      }, 'toggleChannel');

      const data = await withLoading(async () => {
        return await getChannelsWithToken(accessToken);
      }, 'refreshChannels');

      channelsRef.value = data.channels;
      channelSettingsRef.value = data.settings;
      channelDefinitionsRef.value = data.definitions as ChannelDefinition[];

      return true;
    } catch (err) {
      showToast(getErrorMessage(err, t('toast.save_failed')), 'error');
      return false;
    }
  }

  function restoreChannelSelection() {
    const saved = sessionStorage.getItem('bee_swarm_selected_channels');
    if (saved) {
      try {
        const selectedIds: string[] = JSON.parse(saved);
        selectedChannelsRef.value = new Set(selectedIds as PushChannel[]);
      } catch {
        selectedChannelsRef.value = new Set();
      }
    }
  }

  function saveChannelSelection() {
    const selectedIds = Array.from(selectedChannelsRef.value);
    sessionStorage.setItem('bee_swarm_selected_channels', JSON.stringify(selectedIds));
  }

  function toggleChannel(channel: PushChannel) {
    if (selectedChannelsRef.value.has(channel)) {
      selectedChannelsRef.value.delete(channel);
    } else {
      selectedChannelsRef.value.add(channel);
    }
    saveChannelSelection();
  }

  function clearChannelSelection() {
    selectedChannelsRef.value.clear();
    sessionStorage.removeItem('bee_swarm_selected_channels');
  }

  function getSelectedChannels(): PushChannel[] {
    return Array.from(selectedChannelsRef.value);
  }

  const enabledChannelCount = computed(() => {
    return channelsRef.value.filter((c) => c.enabled).length;
  });

  return {
    channels: channelsRef,
    channelDefinitions: channelDefinitionsRef,
    channelSettings: channelSettingsRef,
    selectedChannels: selectedChannelsRef,
    enabledChannelCount,
    loadChannels,
    saveChannel,
    toggleChannelEnabled,
    restoreChannelSelection,
    saveChannelSelection,
    toggleChannel,
    clearChannelSelection,
    getSelectedChannels,
  };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

/**
 * 推送历史管理 Composable
 */

const historyRef = ref<PushHistoryRecord[]>([]);
const isLoadingRef = ref(false);
const totalRef = ref(0);
const pageRef = ref(1);
const historyPageSize = 20;

interface HistoryOptions {
  page?: number;
  channel?: string;
  status?: string;
  keyword?: string;
}

export function usePushHistory() {
  const t = useTranslation();
  async function loadHistory(accessToken: string, options: HistoryOptions = {}): Promise<void> {
    isLoadingRef.value = true;
    pageRef.value = options.page || 1;

    try {
      const { getHistoryWithToken } = await import('@/api');
      const data = await withLoading(async () => {
        return await getHistoryWithToken(accessToken, {
          page: pageRef.value,
          pageSize: historyPageSize,
          channel: options.channel,
          status: options.status,
          keyword: options.keyword,
        });
      }, 'history');

      historyRef.value = data.history || [];
      totalRef.value = data.total || 0;
    } catch (err) {
      showToast(getErrorMessage(err, t('toast.load_history_failed')), 'error');
    } finally {
      isLoadingRef.value = false;
    }
  }

  async function clearHistory(accessToken: string): Promise<boolean> {
    try {
      const { clearHistory } = await import('@/api');
      await withLoading(async () => {
        return await clearHistory(accessToken);
      }, 'clearHistory');

      showToast(t('toast.history_cleared'), 'success');
      await loadHistory(accessToken);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, t('toast.clear_failed')), 'error');
      return false;
    }
  }

  async function deleteHistory(accessToken: string, ids: string[]): Promise<boolean> {
    try {
      const { batchDeleteHistory } = await import('@/api');
      await withLoading(async () => {
        return await batchDeleteHistory(accessToken, ids);
      }, 'deleteHistory');

      showToast(t('toast.records_deleted', { count: String(ids.length) }), 'success');
      await loadHistory(accessToken);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, t('toast.delete_failed')), 'error');
      return false;
    }
  }

  const hasMore = computed(() => {
    return pageRef.value * historyPageSize < totalRef.value;
  });

  return {
    history: historyRef,
    isLoading: isLoadingRef,
    total: totalRef,
    page: pageRef,
    hasMore,
    loadHistory,
    clearHistory,
    deleteHistory,
  };
}
