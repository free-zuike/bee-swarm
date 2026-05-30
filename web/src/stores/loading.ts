import { reactive } from 'vue';

const state = reactive({
  globalLoading: false,
  loadingCount: 0,
});

const pendingRequests = new Map<string, () => void>();

function startLoading(key?: string) {
  state.globalLoading = true;
  state.loadingCount++;
  if (key) {
    pendingRequests.set(key, () => {});
  }
}

function endLoading(key?: string) {
  state.loadingCount = Math.max(0, state.loadingCount - 1);
  state.globalLoading = state.loadingCount > 0;
  if (key) {
    pendingRequests.delete(key);
  }
}

export async function withLoading<T>(fn: () => Promise<T>, key?: string): Promise<T> {
  startLoading(key);
  try {
    return await fn();
  } finally {
    endLoading(key);
  }
}

export function useLoadingStore() {
  return {
    get globalLoading() {
      return state.globalLoading;
    },
    get loadingCount() {
      return state.loadingCount;
    },
    startLoading,
    endLoading,
    withLoading,
  };
}

export { state as loadingState };
