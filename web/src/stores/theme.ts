import { ref, computed, onMounted } from 'vue';

let isDark = ref(false);

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

// 应用主题到文档
function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.setProperty('--bg-primary', '#1e1e1e');
    document.documentElement.style.setProperty('--bg-secondary', '#2d2d2d');
    document.documentElement.style.setProperty('--bg-panel', '#2d2d2d');
    document.documentElement.style.setProperty('--text-primary', '#e0e0e0');
    document.documentElement.style.setProperty('--text-secondary', '#999');
    document.documentElement.style.setProperty('--border-color', '#3c3c3c');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.setProperty('--bg-primary', '#f0f2f5');
    document.documentElement.style.setProperty('--bg-secondary', '#e0e0e0');
    document.documentElement.style.setProperty('--bg-panel', '#ffffff');
    document.documentElement.style.setProperty('--text-primary', '#1a1a2e');
    document.documentElement.style.setProperty('--text-secondary', '#666');
    document.documentElement.style.setProperty('--border-color', '#e0e0e0');
  }
}

export function useThemeStore() {
  onMounted(() => {
    // 如果还没初始化，初始化一次
    if (localStorage.getItem('bee_swarm_theme') === null) {
      initTheme();
    }
  });
  
  return {
    isDark: computed(() => isDark.value),
    toggleTheme,
    initTheme
  };
}

// 立即初始化
initTheme();
