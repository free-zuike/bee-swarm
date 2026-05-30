<script setup lang="ts">
import GlobalLoading from '@/components/GlobalLoading.vue';
</script>

<template>
  <div>
    <GlobalLoading />
    <router-view />
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
</style>
