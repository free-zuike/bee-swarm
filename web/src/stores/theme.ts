import { defineStore } from 'pinia';
import { ref } from 'vue';

// 定义主题类型
type ThemeType = 'light' | 'dark' | 'auto';

// 定义主题配置
interface ThemeColors {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-panel': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--border-color': string;
  '--primary-color': string;
  '--primary-color-hover': string;
  '--success-color': string;
  '--shadow-color': string;
}

const themes: Record<'light' | 'dark', ThemeColors> = {
  light: {
    '--bg-primary': '#f0f2f5',
    '--bg-secondary': '#e0e0e0',
    '--bg-panel': '#ffffff',
    '--text-primary': '#1a1a2e',
    '--text-secondary': '#666',
    '--border-color': '#e0e0e0',
    '--primary-color': '#6366f1',
    '--primary-color-hover': '#5a6fd6',
    '--success-color': '#10b981',
    '--shadow-color': 'rgba(102, 126, 234, 0.4)',
  },
  dark: {
    '--bg-primary': '#1e1e1e',
    '--bg-secondary': '#2d2d2d',
    '--bg-panel': '#2d2d2d',
    '--text-primary': '#e0e0e0',
    '--text-secondary': '#999',
    '--border-color': '#3c3c3c',
    '--primary-color': '#818cf8',
    '--primary-color-hover': '#6366f1',
    '--success-color': '#34d399',
    '--shadow-color': 'rgba(129, 140, 248, 0.3)',
  },
};

// 保存 media query listener 引用（避免内存泄漏）
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeType>('auto');
  const isDark = ref(false);

  const initTheme = () => {
    const savedTheme = localStorage.getItem('bee_swarm_theme') as ThemeType | null;
    if (savedTheme) {
      currentTheme.value = savedTheme;
    }
    applyTheme();

    // 监听系统主题变化（保存引用以便清理）
    if (window.matchMedia && !mediaQueryListener) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQueryListener = () => {
        if (currentTheme.value === 'auto') {
          applyTheme();
        }
      };
      mediaQuery.addEventListener('change', mediaQueryListener);
    }
  };

  const setTheme = (theme: ThemeType) => {
    currentTheme.value = theme;
    localStorage.setItem('bee_swarm_theme', theme);
    applyTheme();
  };

  const toggleTheme = () => {
    if (currentTheme.value === 'light') {
      setTheme('dark');
    } else if (currentTheme.value === 'dark') {
      setTheme('auto');
    } else {
      setTheme('light');
    }
  };

  const applyTheme = () => {
    let effectiveTheme: 'light' | 'dark';
    if (currentTheme.value === 'auto') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      effectiveTheme = currentTheme.value;
    }

    isDark.value = effectiveTheme === 'dark';
    const colors = themes[effectiveTheme];

    if (isDark.value) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    Object.entries(colors).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  };

  // 清理函数
  const dispose = () => {
    if (mediaQueryListener && window.matchMedia) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .removeEventListener('change', mediaQueryListener);
      mediaQueryListener = null;
    }
  };

  initTheme();

  return {
    currentTheme,
    isDark,
    setTheme,
    toggleTheme,
    initTheme,
    dispose,
  };
});
