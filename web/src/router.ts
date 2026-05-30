// ============================================
// 路由配置
// ============================================
import { createRouter, createWebHistory } from 'vue-router';

// 路由懒加载
const AdminPage = () => import('@/views/AdminPage.vue');
const ApiDocs = () => import('@/views/ApiDocs.vue');

const routes = [
  { path: '/', name: 'home', component: AdminPage },
  { path: '/admin', name: 'admin', component: AdminPage },
  { path: '/docs', name: 'api-docs', component: ApiDocs },
  { path: '/api-docs', name: 'api-docs-redirect', component: ApiDocs },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
});

export default router;
