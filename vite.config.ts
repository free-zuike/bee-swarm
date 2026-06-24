import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],

  root: 'web',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'web/src'),
    },
  },

  // 构建配置：输出到 dist 目录，供 Workers 服务
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'charts': ['echarts', 'vue-echarts'],
        },
      },
    },
  },

  // 开发服务器代理：API 请求转发到 Workers
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/sw.js': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
