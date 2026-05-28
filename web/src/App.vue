<script setup lang="ts">
// ============================================
// 根组件
// ============================================
</script>

<template>
  <router-view />
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
</style>
