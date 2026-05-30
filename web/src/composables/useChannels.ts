/**
 * 渠道数据管理 Composable
 * 统一管理推送渠道的状态和操作
 */
import { ref, computed } from 'vue';
import type { ChannelConfig, ChannelDefinition, ChannelSettings, PushChannel, PushResult, PushHistoryRecord } from '@/types';
import { showToast } from './useToast';
import { withLoading } from '@/stores/loading';

const channelsRef = ref<ChannelConfig[]>([]);
const channelDefinitionsRef = ref<ChannelDefinition[]>([]);
const channelSettingsRef = ref<ChannelSettings>({});
const selectedChannelsRef = ref<Set<PushChannel>>(new Set());

export function useChannels() {
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
      showToast(getErrorMessage(err, '加载渠道失败'), 'error');
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

      showToast(result.message || '保存成功', 'success');
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, '保存失败'), 'error');
      return false;
    }
  }

  async function toggleChannelEnabled(
    accessToken: string,
    channelId: string
  ): Promise<boolean> {
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
      showToast(getErrorMessage(err, '保存失败'), 'error');
      return false;
    }
  }

  async function testChannel(
    accessToken: string,
    channelId: string,
    fields: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { sendPushWithToken } = await import('@/api');
      const result = await withLoading(async () => {
        return await sendPushWithToken(accessToken, {
          title: '测试消息',
          body: '这是一条来自蜂群的测试消息',
          channels: [channelId as any],
        });
      }, 'testChannel');

      const channelResult = result.results?.find((r: PushResult) => r.channel === channelId);
      return {
        success: channelResult?.success || false,
        message: channelResult?.message || result.message || '测试完成',
      };
    } catch (err) {
      return {
        success: false,
        message: getErrorMessage(err, '测试失败'),
      };
    }
  }

  function restoreChannelSelection() {
    const saved = sessionStorage.getItem('push_selected_channels');
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
    sessionStorage.setItem('push_selected_channels', JSON.stringify(selectedIds));
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
    sessionStorage.removeItem('push_selected_channels');
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
    testChannel,
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
interface UsePushHistoryReturn {
  history: typeof historyRef;
  isLoading: typeof isLoadingRef;
  total: typeof totalRef;
  page: typeof pageRef;
  loadHistory: (accessToken: string, options?: HistoryOptions) => Promise<void>;
  clearHistory: (accessToken: string) => Promise<boolean>;
  deleteHistory: (accessToken: string, ids: string[]) => Promise<boolean>;
}

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
      showToast(getErrorMessage(err, '加载历史失败'), 'error');
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

      showToast('推送历史已清空', 'success');
      await loadHistory(accessToken);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, '清空失败'), 'error');
      return false;
    }
  }

  async function deleteHistory(accessToken: string, ids: string[]): Promise<boolean> {
    try {
      const { batchDeleteHistory } = await import('@/api');
      await withLoading(async () => {
        return await batchDeleteHistory(accessToken, ids);
      }, 'deleteHistory');

      showToast(`已删除 ${ids.length} 条记录`, 'success');
      await loadHistory(accessToken);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, '删除失败'), 'error');
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
