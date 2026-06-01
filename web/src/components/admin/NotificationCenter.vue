<template>
  <Teleport to="body">
    <Transition name="slide">
      <div v-if="show" class="notification-overlay" @click="close">
        <div class="notification-panel" @click.stop>
          <div class="panel-header">
            <h3>通知中心</h3>
            <div class="header-actions">
              <button 
                v-if="notifications.length > 0"
                class="btn-text"
                @click="markAllAsRead"
              >
                全部已读
              </button>
              <button class="btn-close" @click="close">✕</button>
            </div>
          </div>
          
          <div class="panel-body">
            <div v-if="notifications.length === 0" class="empty-state">
              <span class="empty-icon">🔔</span>
              <p>暂无新通知</p>
            </div>
            
            <div v-else class="notification-list">
              <TransitionGroup name="fade">
                <div
                  v-for="notification in notifications"
                  :key="notification.id"
                  :class="['notification-item', { unread: !notification.read }]"
                  @click="handleNotificationClick(notification)"
                >
                  <div class="notification-icon" :class="notification.type">
                    {{ getIcon(notification.type) }}
                  </div>
                  <div class="notification-content">
                    <div class="notification-title">{{ notification.title }}</div>
                    <div class="notification-message">{{ notification.message }}</div>
                    <div class="notification-time">{{ formatTime(notification.timestamp) }}</div>
                  </div>
                  <button 
                    v-if="!notification.read"
                    class="btn-mark-read"
                    @click.stop="markAsRead(notification.id)"
                    title="标记为已读"
                  >
                    ✓
                  </button>
                </div>
              </TransitionGroup>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/i18n';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  action?: () => void;
}

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
}>();

const { t } = useI18n();
const notifications = ref<Notification[]>([]);

const getIcon = (type: string): string => {
  const icons: Record<string, string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };
  return icons[type] || 'ℹ️';
};

const formatTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
};

const close = () => {
  emit('update:show', false);
};

const markAsRead = (id: string) => {
  const notification = notifications.value.find((n) => n.id === id);
  if (notification) {
    notification.read = true;
  }
};

const markAllAsRead = () => {
  notifications.value.forEach((n) => {
    n.read = true;
  });
};

const handleNotificationClick = (notification: Notification) => {
  if (!notification.read) {
    markAsRead(notification.id);
  }
  
  if (notification.action) {
    notification.action();
    close();
  }
};

const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
  const newNotification: Notification = {
    ...notification,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    read: false,
  };
  
  notifications.value.unshift(newNotification);
  
  if (notifications.value.length > 50) {
    notifications.value.pop();
  }
};

const clearAll = () => {
  notifications.value = [];
};

defineExpose({
  addNotification,
  clearAll,
  markAsRead,
  markAllAsRead,
});
</script>

<style scoped>
.notification-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 60px 20px 20px;
}

.notification-panel {
  width: 400px;
  max-width: 100%;
  height: calc(100vh - 80px);
  background: var(--bg-panel);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-text {
  background: none;
  border: none;
  color: #1890ff;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-text:hover {
  background: rgba(24, 144, 255, 0.1);
}

.btn-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 20px;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.notification-item:hover {
  background: var(--bg-secondary);
}

.notification-item.unread {
  background: rgba(24, 144, 255, 0.05);
}

.notification-item.unread::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: #1890ff;
  border-radius: 0 2px 2px 0;
}

.notification-icon {
  font-size: 24px;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 50%;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.notification-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 6px;
}

.notification-time {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.btn-mark-read {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
  align-self: center;
}

.btn-mark-read:hover {
  background: #1890ff;
  border-color: #1890ff;
  color: white;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

.slide-enter-from .notification-panel,
.slide-leave-to .notification-panel {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@media (max-width: 480px) {
  .notification-panel {
    width: 100%;
    height: 100vh;
    border-radius: 0;
  }
}
</style>
