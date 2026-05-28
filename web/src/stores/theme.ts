import { reactive } from 'vue';

const state = reactive({
  isDark: false,
});

function initTheme() {
  const savedTheme = localStorage.getItem('bee_swarm_theme');
  if (savedTheme !== null) {
    state.isDark = savedTheme === 'dark';
  } else {
    state.isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  applyTheme();
}

function toggleTheme() {
  state.isDark = !state.isDark;
  localStorage.setItem('bee_swarm_theme', state.isDark ? 'dark' : 'light');
  applyTheme();
}

function applyTheme() {
  if (state.isDark) {
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

initTheme();

export function useThemeStore() {
  return {
    get isDark() {
      return state.isDark;
    },
    toggleTheme,
  };
}

export { state as themeState };
