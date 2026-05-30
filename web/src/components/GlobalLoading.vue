<script setup lang="ts">
/**
 * 全局加载状态指示器
 * 在页面切换或数据加载时显示
 */
import { computed } from 'vue';
import { loadingState } from '@/stores/loading';
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
const isVisible = computed(() => loadingState.globalLoading);
const loadingCount = computed(() => loadingState.loadingCount);
</script>

<template>
  <Teleport to="body">
    <Transition name="loading">
      <div v-if="isVisible" class="global-loading-overlay" :class="{ dark: isDark }">
        <div class="loading-container">
          <div class="loading-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
          </div>
          <p class="loading-text">加载中...</p>
          <p v-if="loadingCount > 1" class="loading-count">
            还有 {{ loadingCount - 1 }} 个请求进行中
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(240, 242, 245, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.global-loading-overlay.dark {
  background: rgba(30, 30, 30, 0.9);
}

.loading-container {
  text-align: center;
}

.loading-spinner {
  position: relative;
  width: 60px;
  height: 60px;
  margin: 0 auto 16px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1.2s linear infinite;
}

.spinner-ring:nth-child(2) {
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;
  border-top-color: #764ba2;
  animation-duration: 1.5s;
  animation-direction: reverse;
}

.spinner-ring:nth-child(3) {
  width: 60%;
  height: 60%;
  top: 20%;
  left: 20%;
  border-top-color: #f093fb;
  animation-duration: 1.8s;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary, #666);
  margin: 0;
}

.global-loading-overlay.dark .loading-text {
  color: var(--text-secondary, #999);
}

.loading-count {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin: 4px 0 0;
}

.loading-enter-active,
.loading-leave-active {
  transition: opacity 0.3s ease;
}

.loading-enter-from,
.loading-leave-to {
  opacity: 0;
}
</style>
