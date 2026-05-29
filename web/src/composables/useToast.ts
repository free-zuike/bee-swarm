import { ref } from 'vue';

interface Toast {
  text: string;
  type: 'success' | 'error';
}

const toast = ref<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string, type: 'success' | 'error' = 'success') {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { text, type };
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 2000);
}

export function useGlobalToast() {
  return {
    toast,
    showToast,
  };
}
