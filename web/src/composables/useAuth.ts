import { ref } from 'vue';
import { getToken, refreshToken as refreshTokenApi } from '@/api';

interface AuthState {
  email: string;
  accessToken: string;
  refreshTokenValue: string;
  tokenExpiresAt: number;
}

const STORAGE_KEYS = {
  EMAIL: 'push_hub_email',
  TOKEN: 'push_hub_token',
  REFRESH_TOKEN: 'push_hub_refresh_token',
  EXPIRES_AT: 'push_hub_expires_at',
};

export function useAuth() {
  const email = ref<string>('');
  const accessToken = ref<string>('');
  const refreshTokenValue = ref<string>('');
  const tokenExpiresAt = ref<number>(0);

  // 从 storage 加载认证状态
  const loadFromStorage = (): boolean => {
    const savedEmail = sessionStorage.getItem(STORAGE_KEYS.EMAIL);
    const savedToken = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
    const savedRefreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    const savedExpiresAt = sessionStorage.getItem(STORAGE_KEYS.EXPIRES_AT);

    if (savedEmail && savedToken && savedRefreshToken && savedExpiresAt) {
      email.value = savedEmail;
      accessToken.value = savedToken;
      refreshTokenValue.value = savedRefreshToken;
      tokenExpiresAt.value = parseInt(savedExpiresAt, 10);
      return true;
    }
    return false;
  };

  // 保存认证状态到 storage
  const saveToStorage = () => {
    sessionStorage.setItem(STORAGE_KEYS.EMAIL, email.value);
    sessionStorage.setItem(STORAGE_KEYS.TOKEN, accessToken.value);
    sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshTokenValue.value);
    sessionStorage.setItem(STORAGE_KEYS.EXPIRES_AT, tokenExpiresAt.value.toString());
  };

  // 清除认证状态
  const clearAuth = () => {
    email.value = '';
    accessToken.value = '';
    refreshTokenValue.value = '';
    tokenExpiresAt.value = 0;

    Object.values(STORAGE_KEYS).forEach(key => {
      sessionStorage.removeItem(key);
    });
  };

  // 登录并获取 token
  const login = async (authEmail: string, authPassword: string) => {
    const tokenData = await getToken(authEmail, authPassword);
    email.value = authEmail;
    accessToken.value = tokenData.token;
    refreshTokenValue.value = tokenData.refreshToken;
    tokenExpiresAt.value = tokenData.expiresAt;
    saveToStorage();
  };

  // 刷新 token
  const refresh = async () => {
    const tokenData = await refreshTokenApi(refreshTokenValue.value);
    accessToken.value = tokenData.token;
    refreshTokenValue.value = tokenData.refreshToken;
    tokenExpiresAt.value = tokenData.expiresAt;
    saveToStorage();
  };

  // 检查 token 是否有效
  const isTokenValid = (): boolean => {
    return accessToken.value.length > 0 && tokenExpiresAt.value > Date.now();
  };

  return {
    email,
    accessToken,
    refreshTokenValue,
    tokenExpiresAt,
    loadFromStorage,
    saveToStorage,
    clearAuth,
    login,
    refresh,
    isTokenValid,
  };
}
