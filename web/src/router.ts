// ============================================
// 路由配置
// ============================================
import { createRouter, createWebHistory } from 'vue-router';
import AdminPage from '@/views/AdminPage.vue';
import ApiDocs from '@/views/ApiDocs.vue';

const routes = [
  { path: '/', name: 'home', component: AdminPage },
  { path: '/admin', name: 'admin', component: AdminPage },
  { path: '/docs', name: 'api-docs', component: ApiDocs },
  { path: '/api-docs', name: 'api-docs-redirect', component: ApiDocs },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
