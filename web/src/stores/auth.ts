import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login, register, getToken, refreshToken } from '@/api';
import { t } from '@/i18n';

export interface AuthState {
  email: string;
  accessToken: string;
  refreshTokenValue: string;
  tokenExpiresAt: number;
  isAuthenticating: boolean;
  authError: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  const email = ref<string>('');
  const accessToken = ref<string>('');
  const refreshTokenValue = ref<string>('');
  const tokenExpiresAt = ref<number>(0);
  const isAuthenticating = ref<boolean>(false);
  const authError = ref<string | null>(null);
  const isAuthenticated = computed(() => !!accessToken.value && tokenExpiresAt.value > Date.now());

  const initAuth = () => {
    const savedEmail = sessionStorage.getItem('bee_swarm_email');
    const savedToken = sessionStorage.getItem('bee_swarm_token');
    const savedRefreshToken = sessionStorage.getItem('bee_swarm_refresh_token');
    const savedExpiresAt = sessionStorage.getItem('bee_swarm_expires_at');

    if (savedEmail && savedToken && savedRefreshToken && savedExpiresAt) {
      email.value = savedEmail;
      accessToken.value = savedToken;
      refreshTokenValue.value = savedRefreshToken;
      tokenExpiresAt.value = parseInt(savedExpiresAt, 10);
      return true;
    }
    return false;
  };

  const saveToStorage = () => {
    sessionStorage.setItem('bee_swarm_email', email.value);
    sessionStorage.setItem('bee_swarm_token', accessToken.value);
    sessionStorage.setItem('bee_swarm_refresh_token', refreshTokenValue.value);
    sessionStorage.setItem('bee_swarm_expires_at', tokenExpiresAt.value.toString());
  };

  const clearStorage = () => {
    sessionStorage.removeItem('bee_swarm_email');
    sessionStorage.removeItem('bee_swarm_token');
    sessionStorage.removeItem('bee_swarm_refresh_token');
    sessionStorage.removeItem('bee_swarm_expires_at');
  };

  const setAuthError = (error: string | null) => {
    authError.value = error;
  };

  const doLogin = async (authEmail: string, authPassword: string) => {
    isAuthenticating.value = true;
    authError.value = null;

    try {
      await login(authEmail, authPassword);
      const tokenData = await getToken(authEmail, authPassword);
      email.value = authEmail;
      accessToken.value = tokenData.token;
      refreshTokenValue.value = tokenData.refreshToken;
      tokenExpiresAt.value = tokenData.expiresAt;
      saveToStorage();
      return true;
    } catch (error: unknown) {
      authError.value = (error as { message?: string })?.message || t('error.login_failed');
      return false;
    } finally {
      isAuthenticating.value = false;
    }
  };

  const doRegister = async (authEmail: string, authPassword: string) => {
    isAuthenticating.value = true;
    authError.value = null;

    try {
      await register(authEmail, authPassword);
      return await doLogin(authEmail, authPassword);
    } catch (error: unknown) {
      authError.value = (error as { message?: string })?.message || t('error.register_failed');
      return false;
    } finally {
      isAuthenticating.value = false;
    }
  };

  const doRefreshToken = async () => {
    if (!refreshTokenValue.value) return false;
    try {
      const tokenData = await refreshToken(refreshTokenValue.value);
      accessToken.value = tokenData.token;
      refreshTokenValue.value = tokenData.refreshToken;
      tokenExpiresAt.value = tokenData.expiresAt;
      saveToStorage();
      return true;
    } catch {
      logout();
      return false;
    }
  };

  const logout = () => {
    email.value = '';
    accessToken.value = '';
    refreshTokenValue.value = '';
    tokenExpiresAt.value = 0;
    authError.value = null;
    clearStorage();
  };

  return {
    email,
    accessToken,
    refreshTokenValue,
    tokenExpiresAt,
    isAuthenticated,
    isAuthenticating,
    authError,
    initAuth,
    doLogin,
    doRegister,
    doRefreshToken,
    logout,
    setAuthError,
  };
});
