// ============================================
// 路由配置
// ============================================
import { createRouter, createWebHistory } from 'vue-router';
import AdminPage from '@/views/AdminPage.vue';

const routes = [
  { path: '/', name: 'home', component: AdminPage },
  { path: '/admin', name: 'admin', component: AdminPage },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
