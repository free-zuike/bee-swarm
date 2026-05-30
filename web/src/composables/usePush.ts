/**
 * 推送管理 Composable
 * 统一管理推送操作的状态和结果
 */
import { ref, computed } from 'vue';
import type { PushChannel, PushResult, PushPayload } from '@/types';
import { showToast } from './useToast';
import { withLoading } from '@/stores/loading';
import { useTranslation } from '@/i18n';

interface UsePushOptions {
  onSuccess?: (results: PushResult[]) => void;
  onError?: (error: string) => void;
}

const isPushingRef = ref(false);
const resultsRef = ref<PushResult[]>([]);
const lastPushTimeRef = ref('-');

export function usePush(options: UsePushOptions = {}) {
  const t = useTranslation();

  async function sendPush(
    accessToken: string,
    payload: PushPayload,
    channels: PushChannel[]
  ): Promise<PushResult[]> {
    if (isPushingRef.value) {
      return [];
    }

    isPushingRef.value = true;
    resultsRef.value = [];

    try {
      const { sendPushWithToken } = await import('@/api');

      const result = await withLoading(async () => {
        const reqPayload: any = { ...payload };
        if (channels.length > 0) {
          reqPayload.channels = channels;
        }
        return await sendPushWithToken(accessToken, reqPayload);
      }, 'push');

      resultsRef.value = result.results || [];
      lastPushTimeRef.value = new Date().toLocaleTimeString('zh-CN');

      const successCount = resultsRef.value.filter((r) => r.success).length;
      const totalCount = resultsRef.value.length;

      if (successCount === totalCount) {
        showToast(t('msg.push_success', { count: String(successCount) }), 'success');
        options.onSuccess?.(resultsRef.value);
      } else if (successCount > 0) {
        showToast(t('msg.push_partial', { success: String(successCount), total: String(totalCount) }), 'error');
      } else {
        showToast(t('msg.push_failed'), 'error');
        options.onError?.(t('msg.push_failed'));
      }

      return resultsRef.value;
    } catch (err) {
      const errorMsg = getErrorMessage(err, '推送失败');
      resultsRef.value = [{ channel: 'webpush' as PushChannel, success: false, message: errorMsg }];
      showToast(errorMsg, 'error');
      options.onError?.(errorMsg);
      return resultsRef.value;
    } finally {
      isPushingRef.value = false;
    }
  }

  function clearResults() {
    resultsRef.value = [];
  }

  const hasSuccess = computed(() => {
    return resultsRef.value.some((r) => r.success);
  });

  const hasError = computed(() => {
    return resultsRef.value.some((r) => !r.success);
  });

  const successCount = computed(() => {
    return resultsRef.value.filter((r) => r.success).length;
  });

  const errorCount = computed(() => {
    return resultsRef.value.filter((r) => !r.success).length;
  });

  return {
    isPushing: isPushingRef,
    results: resultsRef,
    lastPushTime: lastPushTimeRef,
    hasSuccess,
    hasError,
    successCount,
    errorCount,
    sendPush,
    clearResults,
  };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

/**
 * 定时推送管理 Composable
 */
interface UseScheduledPushesReturn {
  scheduledPushes: typeof scheduledPushesRef;
  isLoading: typeof isLoadingRef;
  loadScheduledPushes: (accessToken: string, status?: string) => Promise<void>;
  createScheduledPush: (accessToken: string, data: any) => Promise<boolean>;
  deleteScheduledPush: (accessToken: string, id: string) => Promise<boolean>;
}

const scheduledPushesRef = ref<any[]>([]);
const isLoadingRef = ref(false);

export function useScheduledPushes() {
  async function loadScheduledPushes(accessToken: string, status?: string): Promise<void> {
    isLoadingRef.value = true;

    try {
      const { getScheduledPushes } = await import('@/api');
      const result = await withLoading(async () => {
        return await getScheduledPushes(accessToken, status);
      }, 'scheduled');
      
      // 处理可能的返回格式（可能返回数组或带scheduled属性的对象）
      scheduledPushesRef.value = Array.isArray(result) ? result : (result.scheduled || []);
    } catch (err) {
      showToast(getErrorMessage(err, '加载定时推送失败'), 'error');
    } finally {
      isLoadingRef.value = false;
    }
  }

  async function createScheduledPush(accessToken: string, data: any): Promise<boolean> {
    try {
      const { createScheduledPush } = await import('@/api');
      await withLoading(async () => {
        return await createScheduledPush(accessToken, data);
      }, 'createScheduled');

      showToast('定时推送已创建', 'success');
      await loadScheduledPushes(accessToken);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, '创建失败'), 'error');
      return false;
    }
  }

  async function deleteScheduledPush(accessToken: string, id: string): Promise<boolean> {
    try {
      const { deleteScheduledPush } = await import('@/api');
      await withLoading(async () => {
        return await deleteScheduledPush(accessToken, id);
      }, 'deleteScheduled');

      showToast('定时推送已删除', 'success');
      await loadScheduledPushes(accessToken);
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, '删除失败'), 'error');
      return false;
    }
  }

  return {
    scheduledPushes: scheduledPushesRef,
    isLoading: isLoadingRef,
    loadScheduledPushes,
    createScheduledPush,
    deleteScheduledPush,
  };
}
