// ============================================
// 路由配置
// ============================================
import { createRouter, createWebHistory } from 'vue-router';
import SubscribePage from '@/views/SubscribePage.vue';
import AdminPage from '@/views/AdminPage.vue';

const routes = [
  { path: '/', name: 'subscribe', component: SubscribePage },
  { path: '/admin', name: 'admin', component: AdminPage },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
