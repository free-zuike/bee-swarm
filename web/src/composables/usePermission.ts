import { ref, computed } from 'vue';

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

function getInitialRole(): UserRole {
  if (typeof localStorage === 'undefined') return 'user';
  const saved = localStorage.getItem(ROLE_KEY);
  if (saved === 'admin' || saved === 'user' || saved === 'viewer') {
    return saved;
  }
  return 'user';
}

const currentRole = ref<UserRole>(getInitialRole());
const isAdmin = computed(() => currentRole.value === 'admin');
const isUser = computed(() => currentRole.value === 'user');
const isViewer = computed(() => currentRole.value === 'viewer');

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

  const loadCurrentUser = async (): Promise<void> => {
    return;
  };

  const setRole = (role: UserRole): void => {
    currentRole.value = role;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ROLE_KEY, role);
    }
  };

  return {
    currentRole,
    isAdmin,
    isUser,
    isViewer,
    hasPermission,
    hasRole,
    loadCurrentUser,
    setRole,
  };
}
