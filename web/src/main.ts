// ============================================
// Vue 应用入口
// ============================================
import { createApp } from 'vue';
import router from './router';
import App from './App.vue';
import { initLocale } from './i18n';

// 初始化国际化
initLocale();

const app = createApp(App);

app.use(router);

app.mount('#app');
