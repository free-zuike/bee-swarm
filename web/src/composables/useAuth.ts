/**
 * 认证状态管理 Composable
 * 统一管理用户认证相关的状态和操作
 */
import { ref, computed } from 'vue';
import { showToast } from './useToast';
import { useTranslation } from '@/i18n';

interface TokenData {
  token: string;
  refreshToken: string;
  expiresAt: number;
}

interface UseAuthState {
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  pageState: 'loading' | 'auth' | 'dashboard';
}

const authState = ref<UseAuthState>({
  email: '',
  accessToken: '',
  refreshToken: '',
  tokenExpiresAt: 0,
  pageState: 'loading',
});

export function useAuth() {
  const t = useTranslation();

  const isAuthenticated = computed(() => {
    return authState.value.accessToken && authState.value.tokenExpiresAt > Date.now();
  });

  const isLoading = computed(() => authState.value.pageState === 'loading');
  const isAuthPage = computed(() => authState.value.pageState === 'auth');
  const isDashboard = computed(() => authState.value.pageState === 'dashboard');

  function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }

  async function initialize() {
    try {
      const savedEmail = sessionStorage.getItem('push_hub_email');
      const savedToken = sessionStorage.getItem('push_hub_token');
      const savedRefreshToken = sessionStorage.getItem('push_hub_refresh_token');
      const savedExpiresAt = sessionStorage.getItem('push_hub_expires_at');

      if (savedEmail && savedToken && savedRefreshToken && savedExpiresAt) {
        authState.value.email = savedEmail;
        authState.value.accessToken = savedToken;
        authState.value.refreshToken = savedRefreshToken;
        authState.value.tokenExpiresAt = parseInt(savedExpiresAt, 10);

        if (authState.value.tokenExpiresAt > Date.now()) {
          authState.value.pageState = 'dashboard';
          return true;
        }

        try {
          const { refreshToken: rt } = await import('@/api');
          const tokenData = await rt(authState.value.refreshToken);
          updateTokenData(tokenData);
          authState.value.pageState = 'dashboard';
          return true;
        } catch {
          clearAuth();
        }
      }
      authState.value.pageState = 'auth';
      return false;
    } catch {
      authState.value.pageState = 'auth';
      return false;
    }
  }

  async function login(email: string, password: string): Promise<boolean> {
    try {
      const { login: apiLogin, getToken } = await import('@/api');

      await apiLogin(email, password);
      const tokenData = await getToken(email, password);
      authState.value.email = email;
      updateTokenData(tokenData);
      authState.value.pageState = 'dashboard';
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, t('msg.login_failed')), 'error');
      return false;
    }
  }

  async function register(email: string, password: string): Promise<boolean> {
    try {
      const { register: apiRegister } = await import('@/api');
      await apiRegister(email, password);
      return await login(email, password);
    } catch (err) {
      showToast(getErrorMessage(err, t('msg.register_failed')), 'error');
      return false;
    }
  }

  function logout() {
    clearAuth();
    authState.value.pageState = 'auth';
  }

  function updateTokenData(data: TokenData) {
    authState.value.accessToken = data.token;
    authState.value.refreshToken = data.refreshToken;
    authState.value.tokenExpiresAt = data.expiresAt;

    sessionStorage.setItem('push_hub_token', data.token);
    sessionStorage.setItem('push_hub_refresh_token', data.refreshToken);
    sessionStorage.setItem('push_hub_expires_at', data.expiresAt.toString());
  }

  function clearAuth() {
    authState.value.email = '';
    authState.value.accessToken = '';
    authState.value.refreshToken = '';
    authState.value.tokenExpiresAt = 0;
    sessionStorage.removeItem('push_hub_email');
    sessionStorage.removeItem('push_hub_token');
    sessionStorage.removeItem('push_hub_refresh_token');
    sessionStorage.removeItem('push_hub_expires_at');
  }

  async function refreshTokenIfNeeded(): Promise<boolean> {
    if (authState.value.tokenExpiresAt > Date.now()) {
      return true;
    }

    try {
      const { refreshToken: rt } = await import('@/api');
      const tokenData = await rt(authState.value.refreshToken);
      updateTokenData(tokenData);
      return true;
    } catch {
      logout();
      return false;
    }
  }

  function getAccessToken(): string {
    return authState.value.accessToken;
  }

  return {
    state: authState,
    isAuthenticated,
    isLoading,
    isAuthPage,
    isDashboard,
    initialize,
    login,
    register,
    logout,
    refreshTokenIfNeeded,
    getAccessToken,
    getErrorMessage,
  };
}
