// 主题管理
import { ref, computed } from 'vue';

// 深色模式状态
const isDark = ref(false);

// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem('bee_swarm_theme');
  if (savedTheme) {
    isDark.value = savedTheme === 'dark';
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  applyTheme();
}

// 切换主题
function toggleTheme() {
  isDark.value = !isDark.value;
  localStorage.setItem('bee_swarm_theme', isDark.value ? 'dark' : 'light');
  applyTheme();
}

// 应用主题
function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// 初始化
initTheme();

export function useThemeStore() {
  return {
    isDark: computed(() => isDark.value),
    toggleTheme
  };
}
