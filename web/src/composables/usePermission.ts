import { ref, computed } from 'vue';
import { getCurrentUser as fetchCurrentUser, type UserInfo } from '@/api';

export type UserRole = 'admin' | 'user' | 'viewer';

export type Permission =
  | 'users:manage'
  | 'channels:manage'
  | 'push:send'
  | 'push:history'
  | 'templates:manage'
  | 'groups:manage'
  | 'scheduled:manage'
  | 'webhook:manage'
  | 'health:view';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'users:manage',
    'channels:manage',
    'push:send',
    'push:history',
    'templates:manage',
    'groups:manage',
    'scheduled:manage',
    'webhook:manage',
    'health:view',
  ],
  user: [
    'channels:manage',
    'push:send',
    'push:history',
    'templates:manage',
    'groups:manage',
    'scheduled:manage',
    'webhook:manage',
    'health:view',
  ],
  viewer: ['push:history', 'health:view'],
};

const ROLE_KEY = 'bee_swarm_user_role';
const USER_ID_KEY = 'bee_swarm_user_id';

function getInitialRole(): UserRole {
  if (typeof localStorage === 'undefined') return 'user';
  const saved = localStorage.getItem(ROLE_KEY);
  if (saved === 'admin' || saved === 'user' || saved === 'viewer') {
    return saved;
  }
  return 'user';
}

function getInitialUserId(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(USER_ID_KEY) || '';
}

const currentRole = ref<UserRole>(getInitialRole());
const currentUserId = ref<string>(getInitialUserId());
const currentUser = ref<UserInfo | null>(null);
const isAdmin = computed(() => currentRole.value === 'admin');
const isUser = computed(() => currentRole.value === 'user');
const isViewer = computed(() => currentRole.value === 'viewer');
const isLoading = ref(false);

export function usePermission() {
  const hasPermission = (permission: Permission): boolean => {
    return ROLE_PERMISSIONS[currentRole.value]?.includes(permission) ?? false;
  };

  const hasRole = (role: UserRole): boolean => {
    const roleHierarchy: Record<UserRole, UserRole[]> = {
      admin: ['admin', 'user', 'viewer'],
      user: ['user', 'viewer'],
      viewer: ['viewer'],
    };
    return roleHierarchy[currentRole.value]?.includes(role) ?? false;
  };

  const loadCurrentUser = async (token: string): Promise<void> => {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
      const user = await fetchCurrentUser(token);
      currentUser.value = user;
      currentRole.value = user.role;
      currentUserId.value = user.id;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ROLE_KEY, user.role);
        localStorage.setItem(USER_ID_KEY, user.id);
      }
    } catch {
      // 如果获取用户信息失败，保持本地存储的角色
    } finally {
      isLoading.value = false;
    }
  };

  const setRole = (role: UserRole, userId?: string): void => {
    currentRole.value = role;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ROLE_KEY, role);
      if (userId) {
        localStorage.setItem(USER_ID_KEY, userId);
        currentUserId.value = userId;
      }
    }
  };

  return {
    currentRole,
    currentUserId,
    currentUser,
    isAdmin,
    isUser,
    isViewer,
    isLoading,
    hasPermission,
    hasRole,
    loadCurrentUser,
    setRole,
  };
}
