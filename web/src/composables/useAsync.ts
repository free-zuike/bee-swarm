import { ref } from 'vue';
import { showToast } from './useToast';
import { useLoadingStore, withLoading } from '@/stores/loading';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseAsyncOptions {
  loadingKey?: string;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
}

/**
 * 统一的异步请求处理 Hook
 * 自动管理加载状态和错误提示
 *
 * @example
 * const { data, loading, error, execute } = useAsync<User[]>({
 *   loadingKey: 'users',
 *   showErrorToast: true,
 * });
 *
 * await execute(() => fetchUsers());
 */
export function useAsync<T>(options: UseAsyncOptions = {}) {
  const { loadingKey, showErrorToast = true, showSuccessToast = false } = options;
  const loadingStore = useLoadingStore();

  const data = ref<T | null>(null) as { value: T | null };
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * 执行异步操作
   * @param fn 异步函数
   * @param successMsg 成功时的提示消息
   * @returns 函数执行结果
   */
  async function execute(fn: () => Promise<T>, successMsg?: string): Promise<T | null> {
    error.value = null;
    loading.value = true;

    try {
      const result = await withLoading(async () => {
        return await fn();
      }, loadingKey);

      data.value = result;

      if (showSuccessToast && successMsg) {
        showToast(successMsg, 'success');
      }

      return result;
    } catch (err) {
      const errorMsg = getErrorMessage(err, '操作失败');
      error.value = errorMsg;

      if (showErrorToast) {
        showToast(errorMsg, 'error');
      }

      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 重置状态
   */
  function reset() {
    data.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}

/**
 * 带状态的异步操作 Hook
 * 返回响应式的状态对象
 *
 * @example
 * const state = useAsyncState<User[]>();
 * await state.execute(() => fetchUsers());
 */
export function useAsyncState<T>(options: UseAsyncOptions = {}) {
  const { loadingKey, showErrorToast = true } = options;
  const loadingStore = useLoadingStore();

  const state = ref<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  /**
   * 执行异步操作并更新状态
   */
  async function execute(fn: () => Promise<T>): Promise<T | null> {
    state.value.loading = true;
    state.value.error = null;

    try {
      const result = await withLoading(async () => {
        return await fn();
      }, loadingKey);

      state.value.data = result;
      return result;
    } catch (err) {
      const errorMsg = getErrorMessage(err, '操作失败');
      state.value.error = errorMsg;

      if (showErrorToast) {
        showToast(errorMsg, 'error');
      }

      return null;
    } finally {
      state.value.loading = false;
    }
  }

  /**
   * 重置状态
   */
  function reset() {
    state.value = {
      data: null,
      loading: false,
      error: null,
    };
  }

  return {
    state,
    execute,
    reset,
  };
}

/**
 * 提取错误消息的统一方法
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

/**
 * 错误处理 Hook
 * 用于在组件中便捷地处理错误
 *
 * @example
 * const { handleError, clearError } = useErrorHandler();
 * try {
 *   await doSomething();
 * } catch (err) {
 *   handleError(err);
 * }
 */
export function useErrorHandler() {
  const error = ref<string | null>(null);

  function handleError(err: unknown, fallback: string = '操作失败') {
    error.value = getErrorMessage(err, fallback);
    showToast(error.value, 'error');
  }

  function clearError() {
    error.value = null;
  }

  return {
    error,
    handleError,
    clearError,
    getErrorMessage,
  };
}

/**
 * 确认操作 Hook
 * 提供确认对话框功能
 *
 * @example
 * const { confirm, isConfirmed } = useConfirm();
 * if (await confirm('确定要删除吗？')) {
 *   await deleteItem();
 * }
 */
export function useConfirm() {
  const isConfirmed = ref(false);
  const pendingConfirm = ref<((result: boolean) => void) | null>(null);

  function confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      isConfirmed.value = true;
      pendingConfirm.value = resolve;

      showToast(message, 'error');

      setTimeout(() => {
        if (pendingConfirm.value === resolve) {
          resolve(false);
          pendingConfirm.value = null;
          isConfirmed.value = false;
        }
      }, 3000);
    });
  }

  function resolveConfirm(result: boolean) {
    if (pendingConfirm.value) {
      pendingConfirm.value(result);
      pendingConfirm.value = null;
      isConfirmed.value = false;
    }
  }

  return {
    isConfirmed,
    confirm,
    resolveConfirm,
  };
}
