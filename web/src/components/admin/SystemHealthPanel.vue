<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { useThemeStore } from '@/stores/theme';
import { useTranslation } from '@/i18n';
import { getSystemHealth, type SystemHealth } from '@/api';

const props = defineProps<{
  accessToken: string;
}>();

const t = useTranslation();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

const loading = ref(true);
const health = ref<SystemHealth>({
  database: { status: 'unknown', message: '' },
  lastCronRun: null,
  activeUsers: 0,
  recentPushCount: 0,
  queueStatus: { available: false, message: '' },
});

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function getStatusColor(status: string): string {
  switch (status) {
    case 'ok':
      return '#52c41a';
    case 'warning':
      return '#faad14';
    case 'error':
      return '#ff4d4f';
    default:
      return '#999';
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'ok':
      return 'rgba(82, 196, 26, 0.1)';
    case 'warning':
      return 'rgba(250, 173, 20, 0.1)';
    case 'error':
      return 'rgba(255, 77, 79, 0.1)';
    default:
      return 'rgba(153, 153, 153, 0.1)';
  }
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return t('label.no_data') || '暂无数据';
  try {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return isoStr;
    return date.toLocaleString('zh-CN');
  } catch {
    return isoStr;
  }
}

async function loadHealth() {
  loading.value = true;
  try {
    const result = await getSystemHealth(props.accessToken);
    if (result.success && result.health) {
      health.value = result.health;
    }
  } catch (err) {
    console.error('Failed to load system health:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadHealth();
  refreshTimer = setInterval(loadHealth, 60000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<template>
  <div class="settings-panel" :class="{ dark: isDark }">
    <h3>🩺 {{ t('label.system_health') || '系统健康监控' }}</h3>

    <div v-if="loading && health.database.status === 'unknown'" class="loading-state">
      <span>{{ t('label.loading') }}...</span>
    </div>

    <div v-else class="health-grid">
      <!-- 数据库状态 -->
      <div class="health-card" :class="{ dark: isDark }">
        <div class="health-indicator" :style="{ background: getStatusBg(health.database.status) }">
          <span
            class="health-dot"
            :style="{ background: getStatusColor(health.database.status) }"
          ></span>
        </div>
        <div class="health-info">
          <div class="health-label">{{ t('label.db_status') || '数据库状态' }}</div>
          <div class="health-value" :style="{ color: getStatusColor(health.database.status) }">
            {{
              health.database.status === 'ok'
                ? '✓ ' + (t('label.normal') || '正常')
                : health.database.message
            }}
          </div>
        </div>
      </div>

      <!-- 队列状态 -->
      <div class="health-card" :class="{ dark: isDark }">
        <div
          class="health-indicator"
          :style="{ background: getStatusBg(health.queueStatus.available ? 'ok' : 'warning') }"
        >
          <span
            class="health-dot"
            :style="{ background: getStatusColor(health.queueStatus.available ? 'ok' : 'warning') }"
          ></span>
        </div>
        <div class="health-info">
          <div class="health-label">{{ t('label.queue_status') || '队列状态' }}</div>
          <div
            class="health-value"
            :style="{ color: getStatusColor(health.queueStatus.available ? 'ok' : 'warning') }"
          >
            {{
              health.queueStatus.available
                ? '✓ ' + (t('label.available') || '可用')
                : '⚠ ' + health.queueStatus.message
            }}
          </div>
        </div>
      </div>

      <!-- 活跃用户数 -->
      <div class="health-card" :class="{ dark: isDark }">
        <div
          class="health-indicator"
          :style="{ background: getStatusBg(health.activeUsers > 0 ? 'ok' : 'warning') }"
        >
          <span
            class="health-dot"
            :style="{ background: getStatusColor(health.activeUsers > 0 ? 'ok' : 'warning') }"
          ></span>
        </div>
        <div class="health-info">
          <div class="health-label">{{ t('label.active_users_7d') || '活跃用户 (7天)' }}</div>
          <div class="health-value">{{ health.activeUsers }}</div>
        </div>
      </div>

      <!-- 最近 24h 推送量 -->
      <div class="health-card" :class="{ dark: isDark }">
        <div
          class="health-indicator"
          :style="{ background: getStatusBg(health.recentPushCount > 0 ? 'ok' : 'warning') }"
        >
          <span
            class="health-dot"
            :style="{ background: getStatusColor(health.recentPushCount > 0 ? 'ok' : 'warning') }"
          ></span>
        </div>
        <div class="health-info">
          <div class="health-label">{{ t('label.push_count_24h') || '推送量 (24h)' }}</div>
          <div class="health-value">{{ health.recentPushCount }}</div>
        </div>
      </div>

      <!-- 最近 Cron 执行时间 -->
      <div class="health-card wide" :class="{ dark: isDark }">
        <div
          class="health-indicator"
          :style="{ background: getStatusBg(health.lastCronRun ? 'ok' : 'warning') }"
        >
          <span
            class="health-dot"
            :style="{ background: getStatusColor(health.lastCronRun ? 'ok' : 'warning') }"
          ></span>
        </div>
        <div class="health-info">
          <div class="health-label">{{ t('label.last_cron_run') || '最近 Cron 执行时间' }}</div>
          <div class="health-value">{{ formatTime(health.lastCronRun) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  padding: 0;
}

.settings-panel h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.loading-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, #999);
  font-size: 14px;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.health-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 8px;
  transition: all 0.2s;
}

.health-card.dark {
  background: var(--bg-secondary, #3c3c3c);
}

.health-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.health-card.wide {
  grid-column: span 2;
}

.health-indicator {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.health-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.health-info {
  flex: 1;
  min-width: 0;
}

.health-label {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-bottom: 2px;
}

.health-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 600px) {
  .health-grid {
    grid-template-columns: 1fr;
  }

  .health-card.wide {
    grid-column: span 1;
  }
}
</style>
