import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login, register, getToken, refreshToken, login2FA } from '@/api';
import { t } from '@/i18n';

export interface AuthState {
  email: string;
  accessToken: string;
  refreshTokenValue: string;
  tokenExpiresAt: number;
  isAuthenticating: boolean;
  authError: string | null;
  pending2FA: boolean;
  pendingPassword: string;
}

export const useAuthStore = defineStore('auth', () => {
  const email = ref<string>('');
  const accessToken = ref<string>('');
  const refreshTokenValue = ref<string>('');
  const tokenExpiresAt = ref<number>(0);
  const isAuthenticating = ref<boolean>(false);
  const authError = ref<string | null>(null);
  const pending2FA = ref<boolean>(false);
  const pendingPassword = ref<string>('');
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

  const doLogin = async (authEmail: string, authPassword: string, turnstileToken?: string) => {
    isAuthenticating.value = true;
    authError.value = null;

    try {
      const result = await login(authEmail, authPassword, turnstileToken);
      if (result.need2FA) {
        // 需要 2FA 验证
        pending2FA.value = true;
        email.value = authEmail;
        pendingPassword.value = authPassword;
        return { need2FA: true } as { need2FA: true };
      }
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

  const doLogin2FA = async (authEmail: string, authPassword: string, code: string) => {
    isAuthenticating.value = true;
    authError.value = null;

    try {
      await login2FA(authEmail, authPassword, code);
      const tokenData = await getToken(authEmail, authPassword);
      email.value = authEmail;
      accessToken.value = tokenData.token;
      refreshTokenValue.value = tokenData.refreshToken;
      tokenExpiresAt.value = tokenData.expiresAt;
      saveToStorage();
      pending2FA.value = false;
      pendingPassword.value = '';
      return true;
    } catch (error: unknown) {
      authError.value = (error as { message?: string })?.message || '验证码无效';
      return false;
    } finally {
      isAuthenticating.value = false;
    }
  };

  const doRegister = async (authEmail: string, authPassword: string, turnstileToken?: string) => {
    isAuthenticating.value = true;
    authError.value = null;

    try {
      const result = await register(authEmail, authPassword, turnstileToken);
      if (result.needVerification) {
        return { success: true, needVerification: true, email: authEmail };
      }
      const loginSuccess = await doLogin(authEmail, authPassword, turnstileToken);
      return { success: loginSuccess, needVerification: false };
    } catch (error: unknown) {
      authError.value = (error as { message?: string })?.message || t('error.register_failed');
      return { success: false, needVerification: false };
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
    pending2FA.value = false;
    pendingPassword.value = '';
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
    pending2FA,
    pendingPassword,
    initAuth,
    doLogin,
    doLogin2FA,
    doRegister,
    doRefreshToken,
    logout,
    setAuthError,
  };
});

export const useAuth = useAuthStore;
