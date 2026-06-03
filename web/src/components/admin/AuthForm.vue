<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
const t = useTranslation();
const { showToast } = useGlobalToast();

const props = defineProps<{
  isAuthing?: boolean;
  authError?: string;
}>();

const emit = defineEmits<{
  login: [email: string, password: string];
  register: [email: string, password: string];
}>();

const authMode = ref<'login' | 'register' | 'forgot' | 'enterToken' | 'reset'>('login');
const authEmail = ref('');
const authPassword = ref('');
const authConfirmPassword = ref('');
const resetToken = ref('');
const localError = ref('');
const isProcessing = ref(false);
const resetEmail = ref('');

function switchMode(mode: 'login' | 'register' | 'forgot' | 'enterToken' | 'reset') {
  authMode.value = mode;
  localError.value = '';
}

function doLogin() {
  localError.value = '';
  if (!authEmail.value.trim() || !authPassword.value) {
    localError.value = t('error.required', { field: t('label.email') + t('label.password') });
    return;
  }
  emit('login', authEmail.value.trim(), authPassword.value);
}

function doRegister() {
  localError.value = '';
  if (!authEmail.value.trim() || !authPassword.value) {
    localError.value = t('error.required', { field: t('label.email') + t('label.password') });
    return;
  }
  if (authPassword.value.length < 8) {
    localError.value = t('error.password_length');
    return;
  }
  if (authPassword.value !== authConfirmPassword.value) {
    localError.value = t('error.password_match');
    return;
  }
  emit('register', authEmail.value.trim(), authPassword.value);
}

async function doForgotPassword() {
  localError.value = '';
  if (!authEmail.value.trim()) {
    localError.value = t('error.required', { field: t('label.email') });
    return;
  }

  isProcessing.value = true;
  try {
    const { requestPasswordReset } = await import('@/api');
    const result = await requestPasswordReset(authEmail.value.trim());
    if (result.success) {
      resetEmail.value = authEmail.value.trim();
      authEmail.value = '';
      authMode.value = 'enterToken';
      showToast('请查看服务器控制台获取重置令牌（测试模式）', 'success');
    } else {
      localError.value = t('message.user_not_found');
    }
  } catch (err) {
    localError.value = (err as Error).message || t('message.password_reset_failed');
  } finally {
    isProcessing.value = false;
  }
}

async function verifyAndReset() {
  localError.value = '';
  if (!resetToken.value.trim()) {
    localError.value = '请输入重置令牌';
    return;
  }
  
  isProcessing.value = true;
  try {
    const { verifyResetToken } = await import('@/api');
    const result = await verifyResetToken(resetToken.value.trim());
    if (result.valid) {
      authMode.value = 'reset';
    } else {
      localError.value = t('message.invalid_reset_token');
    }
  } catch (err) {
    localError.value = (err as Error).message || t('message.password_reset_failed');
  } finally {
    isProcessing.value = false;
  }
}

async function doResetPassword() {
  localError.value = '';
  if (!authPassword.value) {
    localError.value = t('error.required', { field: t('label.password') });
    return;
  }
  if (authPassword.value.length < 8) {
    localError.value = t('error.password_length');
    return;
  }
  if (authPassword.value !== authConfirmPassword.value) {
    localError.value = t('error.password_match');
    return;
  }

  isProcessing.value = true;
  try {
    const { resetPassword } = await import('@/api');
    const result = await resetPassword(resetToken.value, authPassword.value);
    if (result.success) {
      showToast(t('message.password_reset_success'), 'success');
      authMode.value = 'login';
      authEmail.value = '';
      authPassword.value = '';
      authConfirmPassword.value = '';
      resetToken.value = '';
    } else {
      localError.value = t('message.invalid_reset_token');
    }
  } catch (err) {
    localError.value = (err as Error).message || t('message.password_reset_failed');
  } finally {
    isProcessing.value = false;
  }
}

const displayError = computed(() => props.authError || localError.value);

const isResetMode = computed(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token && authMode.value === 'login') {
    resetToken.value = token;
    return true;
  }
  return authMode.value === 'reset';
});
</script>

<template>
  <div class="login-overlay">
    <div class="login-card">
      <h2>{{ t('app.title') }}</h2>
      <p>{{ t('label.app_description') }}</p>

      <div class="auth-tabs">
        <button
          class="auth-tab-btn"
          :class="{ active: authMode === 'login' }"
          @click="switchMode('login')"
        >
          {{ t('button.login') }}
        </button>
        <button
          class="auth-tab-btn"
          :class="{ active: authMode === 'register' }"
          @click="switchMode('register')"
        >
          {{ t('button.register') }}
        </button>
      </div>

      <form v-if="authMode === 'login'" @submit.prevent="doLogin">
        <input
          v-model="authEmail"
          type="text"
          :placeholder="t('label.email')"
          autocomplete="email"
        />
        <input
          v-model="authPassword"
          type="password"
          :placeholder="t('label.password')"
          autocomplete="current-password"
          @keydown.enter="doLogin"
        />
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isAuthing">
          {{ isAuthing ? t('label.logging_in') : t('button.login') }}
        </button>
        <button type="button" class="forgot-password-btn" @click="switchMode('forgot')">
          {{ t('button.forgot_password') }}
        </button>
      </form>

      <form v-else-if="authMode === 'forgot'" @submit.prevent="doForgotPassword">
        <input
          v-model="authEmail"
          type="text"
          :placeholder="t('label.email')"
          autocomplete="email"
        />
        <div class="forgot-hint">{{ t('hint.password_reset') }}</div>
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isProcessing">
          {{ isProcessing ? t('label.processing') : t('button.send_reset_link') }}
        </button>
        <button type="button" class="forgot-password-btn" @click="switchMode('login')">
          {{ t('button.back_to_login') }}
        </button>
      </form>

      <form v-else-if="authMode === 'enterToken'" @submit.prevent="verifyAndReset">
        <input
          v-model="resetToken"
          type="text"
          placeholder="请输入重置令牌"
        />
        <div class="forgot-hint">
          请输入从服务器控制台获取的令牌，或访问 ?token=xxx 的重置链接
        </div>
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isProcessing">
          {{ isProcessing ? t('label.processing') : '验证令牌' }}
        </button>
        <button type="button" class="forgot-password-btn" @click="switchMode('forgot')">
          重新输入邮箱
        </button>
      </form>

      <form v-else-if="authMode === 'reset' || isResetMode" @submit.prevent="doResetPassword">
        <input
          v-model="authPassword"
          type="password"
          :placeholder="t('label.password_placeholder')"
          autocomplete="new-password"
        />
        <input
          v-model="authConfirmPassword"
          type="password"
          :placeholder="t('label.confirm_password')"
          autocomplete="new-password"
          @keydown.enter="doResetPassword"
        />
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isProcessing">
          {{ isProcessing ? t('label.processing') : t('button.reset_password') }}
        </button>
        <button type="button" class="forgot-password-btn" @click="switchMode('login')">
          {{ t('button.back_to_login') }}
        </button>
      </form>

      <form v-else @submit.prevent="doRegister">
        <input
          v-model="authEmail"
          type="text"
          :placeholder="t('label.email')"
          autocomplete="email"
        />
        <input
          v-model="authPassword"
          type="password"
          :placeholder="t('label.password_placeholder')"
          autocomplete="new-password"
        />
        <input
          v-model="authConfirmPassword"
          type="password"
          :placeholder="t('label.confirm_password')"
          autocomplete="new-password"
          @keydown.enter="doRegister"
        />
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isAuthing">
          {{ isAuthing ? t('label.registering') : t('button.register') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.login-card {
  background: var(--bg-panel, white);
  border-radius: 16px;
  padding: 40px;
  width: 380px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-card h2 {
  margin-bottom: 4px;
  color: var(--text-primary, #1a1a2e);
  font-size: 24px;
}

.login-card > p {
  color: var(--text-secondary, #999);
  font-size: 13px;
  margin-bottom: 24px;
}

.login-card form {
  display: flex;
  flex-direction: column;
}

.login-card input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 15px;
  margin-bottom: 12px;
  box-sizing: border-box;
  transition: border-color 0.3s;
  background: var(--bg-panel, white);
  color: var(--text-primary, #1a1a2e);
}

.login-card input:focus {
  outline: none;
  border-color: #667eea;
}

.login-error {
  color: #e74c3c;
  font-size: 13px;
  margin-bottom: 12px;
  text-align: left;
  padding: 8px 12px;
  background: #fff5f5;
  border-radius: 6px;
  border: 1px solid #fecaca;
}

.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  padding: 4px;
}

.auth-tab-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary, #999);
  transition: all 0.2s;
}

.auth-tab-btn:hover {
  color: var(--text-primary, #666);
}

.auth-tab-btn.active {
  background: var(--bg-panel, white);
  color: #667eea;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.forgot-password-btn {
  background: none;
  border: none;
  color: #667eea;
  font-size: 13px;
  cursor: pointer;
  margin-top: 8px;
  padding: 8px 0;
  text-decoration: underline;
}

.forgot-password-btn:hover {
  color: #5a6fd6;
}

.forgot-hint {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
  text-align: left;
}

@media (max-width: 768px) {
  .login-card {
    width: 90%;
    padding: 32px 24px;
  }

  .login-card h2 {
    font-size: 22px;
  }

  .login-card > p {
    font-size: 12px;
    margin-bottom: 20px;
  }

  .login-card input {
    padding: 10px 14px;
    font-size: 14px;
    margin-bottom: 10px;
  }

  .auth-tabs {
    margin-bottom: 20px;
  }

  .auth-tab-btn {
    padding: 7px 14px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .login-card {
    width: 95%;
    padding: 24px 16px;
    border-radius: 12px;
  }

  .login-card h2 {
    font-size: 20px;
  }

  .login-card > p {
    font-size: 11px;
    margin-bottom: 16px;
  }

  .login-card input {
    padding: 9px 12px;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .btn {
    padding: 10px 20px;
    font-size: 13px;
  }

  .auth-tab-btn {
    padding: 6px 12px;
    font-size: 12px;
  }

  .login-error {
    font-size: 12px;
    padding: 6px 10px;
    margin-bottom: 10px;
  }
}
</style>
