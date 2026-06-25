<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
import GlobalLoading from '@/components/GlobalLoading.vue';

const hasError = ref(false);
const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  hasError.value = true;
  error.value = err as Error;
  console.error('[App Error]', err);
  return false; // 阻止错误向上传播
});

function reload() {
  hasError.value = false;
  error.value = null;
  window.location.reload();
}
</script>

<template>
  <div>
    <GlobalLoading />
    <div v-if="hasError" class="error-boundary">
      <div class="error-content">
        <h2>页面出错了</h2>
        <p>{{ error?.message || '未知错误' }}</p>
        <button @click="reload">刷新页面</button>
      </div>
    </div>
    <router-view v-else v-slot="{ Component }">
      <Suspense>
        <component :is="Component" />
        <template #fallback>
          <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <p>加载中...</p>
          </div>
        </template>
      </Suspense>
    </router-view>
  </div>
</template>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 强制显示滚动条避免布局跳动 */
html,
body {
  overflow-y: scroll;
  overflow-x: hidden;
}

/* 移动端安全区域适配 */
body {
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

/* 移动端容器底部padding */
@media (max-width: 768px) {
  #app {
    padding-bottom: calc(48px + env(safe-area-inset-bottom));
  }
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  width: 8px;
}

html::-webkit-scrollbar-track,
body::-webkit-scrollbar-track {
  background: transparent;
}

html::-webkit-scrollbar-thumb,
body::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

html::-webkit-scrollbar-thumb:hover,
body::-webkit-scrollbar-thumb:hover {
  background: #999;
}

/* CSS 变量定义 */
:root {
  --bg-primary: #f0f2f5;
  --bg-secondary: #f5f5f5;
  --bg-panel: white;
  --text-primary: #1a1a2e;
  --text-secondary: #666;
  --border-color: #f0f0f0;
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.dark {
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --bg-panel: #2d2d2d;
  --text-primary: #e0e0e0;
  --text-secondary: #999;
  --border-color: #3c3c3c;
}

.error-boundary {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  z-index: 9999;
}

.error-content {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.error-content h2 {
  color: #e74c3c;
  margin-bottom: 12px;
}

.error-content p {
  color: #666;
  margin-bottom: 20px;
}

.error-content button {
  padding: 10px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
