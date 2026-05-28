<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  isAuthing?: boolean;
  authError?: string;
}>();

const emit = defineEmits<{
  login: [email: string, password: string];
  register: [email: string, password: string];
}>();

const authMode = ref<'login' | 'register'>('login');
const authEmail = ref('');
const authPassword = ref('');
const authConfirmPassword = ref('');
const localError = ref('');

function switchMode(mode: 'login' | 'register') {
  authMode.value = mode;
  localError.value = '';
}

function doLogin() {
  localError.value = '';
  if (!authEmail.value.trim() || !authPassword.value) {
    localError.value = '请输入邮箱和密码';
    return;
  }
  emit('login', authEmail.value.trim(), authPassword.value);
}

function doRegister() {
  localError.value = '';
  if (!authEmail.value.trim() || !authPassword.value) {
    localError.value = '请输入邮箱和密码';
    return;
  }
  if (authPassword.value.length < 4) {
    localError.value = '密码长度至少 4 位';
    return;
  }
  if (authPassword.value !== authConfirmPassword.value) {
    localError.value = '两次输入的密码不一致';
    return;
  }
  emit('register', authEmail.value.trim(), authPassword.value);
}

const displayError = computed(() => props.authError || localError.value);
</script>

<template>
  <div class="login-overlay">
    <div class="login-card">
      <h2>🐝 蜂群</h2>
      <p>多渠道推送管理系统</p>

      <div class="auth-tabs">
        <button
          class="auth-tab-btn"
          :class="{ active: authMode === 'login' }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          class="auth-tab-btn"
          :class="{ active: authMode === 'register' }"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form v-if="authMode === 'login'" @submit.prevent="doLogin">
        <input
          v-model="authEmail"
          type="text"
          placeholder="邮箱"
          autocomplete="email"
        />
        <input
          v-model="authPassword"
          type="password"
          placeholder="密码"
          autocomplete="current-password"
          @keydown.enter="doLogin"
        />
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isAuthing">
          {{ isAuthing ? '登录中...' : '登 录' }}
        </button>
      </form>

      <form v-else @submit.prevent="doRegister">
        <input
          v-model="authEmail"
          type="text"
          placeholder="邮箱"
          autocomplete="email"
        />
        <input
          v-model="authPassword"
          type="password"
          placeholder="密码（至少 4 位）"
          autocomplete="new-password"
        />
        <input
          v-model="authConfirmPassword"
          type="password"
          placeholder="确认密码"
          autocomplete="new-password"
          @keydown.enter="doRegister"
        />
        <div v-if="displayError" class="login-error">{{ displayError }}</div>
        <button class="btn btn-primary" type="submit" :disabled="isAuthing">
          {{ isAuthing ? '注册中...' : '注 册' }}
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
</style>
