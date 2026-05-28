<template>
  <div class="scheduled-push-manager">
    <div class="section-header">
      <h3>定时推送管理</h3>
      <button class="btn btn-primary" @click="showCreateModal = true" :disabled="loading">
        <span class="icon">+</span> 创建定时推送
      </button>
    </div>

    <div v-if="loading && scheduledPushes.length === 0" class="loading-state">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="scheduledPushes.length === 0" class="empty-state">
      <div class="empty-icon">📅</div>
      <p>暂无定时推送</p>
      <button class="btn btn-secondary" @click="showCreateModal = true">创建第一个定时推送</button>
    </div>

    <div v-else class="scheduled-list">
      <div class="filter-bar">
        <button 
          v-for="status in statusFilters" 
          :key="status.value"
          :class="['filter-btn', { active: filterStatus === status.value }]"
          @click="filterStatus = status.value"
        >
          {{ status.label }}
          <span class="count">{{ getCountByStatus(status.value) }}</span>
        </button>
      </div>

      <div class="push-cards">
        <div v-for="push in filteredPushes" :key="push.id" class="push-card" :class="`status-${push.status}`">
          <div class="card-header">
            <span class="status-badge" :class="push.status">{{ getStatusLabel(push.status) }}</span>
            <div class="card-actions">
              <button v-if="push.status === 'pending'" class="btn-icon" @click="cancelPush(push.id)" title="取消">
                ❌
              </button>
              <button class="btn-icon" @click="deletePush(push.id)" title="删除">🗑️</button>
            </div>
          </div>

          <div class="card-body">
            <h4 class="push-title">{{ push.name }}</h4>
            <p class="push-content">{{ push.content }}</p>
            
            <div class="push-meta">
              <div class="meta-item">
                <span class="label">执行时间:</span>
                <span class="value">{{ formatDateTime(push.scheduledTime) }}</span>
              </div>
              <div class="meta-item">
                <span class="label">渠道:</span>
                <span class="value channels">
                  <span v-for="ch in push.channels" :key="ch" class="channel-tag">{{ ch }}</span>
                </span>
              </div>
              <div class="meta-item" v-if="push.templateId">
                <span class="label">模板:</span>
                <span class="value">{{ push.templateId }}</span>
              </div>
            </div>

            <div v-if="push.metadata" class="push-metadata">
              <div class="meta-item" v-if="push.metadata.retries !== undefined">
                <span class="label">重试次数:</span>
                <span class="value">{{ push.metadata.retries }}/{{ push.metadata.maxRetries || 3 }}</span>
              </div>
              <div v-if="push.metadata.lastError" class="error-info">
                <span class="label">最后错误:</span>
                <span class="value error">{{ push.metadata.lastError }}</span>
              </div>
            </div>
          </div>

          <div class="card-footer">
            <span class="created-at">创建于 {{ formatDateTime(push.createdAt) }}</span>
            <button v-if="push.status === 'pending'" class="btn btn-small" @click="testPush(push)">
              测试执行
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>创建定时推送</h3>
          <button class="btn-close" @click="showCreateModal = false">&times;</button>
        </div>

        <form @submit.prevent="createScheduledPush" class="modal-body">
          <div class="form-group">
            <label for="name">任务名称</label>
            <input
              id="name"
              v-model="newPush.name"
              type="text"
              placeholder="例如: 每日早报"
              required
            />
          </div>

          <div class="form-group">
            <label for="content">消息内容</label>
            <textarea
              id="content"
              v-model="newPush.content"
              placeholder="输入推送内容..."
              rows="3"
              required
            ></textarea>
          </div>

          <div class="form-group">
            <label>执行时间</label>
            <div class="datetime-inputs">
              <input
                v-model="newPush.date"
                type="date"
                :min="today"
                required
              />
              <input
                v-model="newPush.time"
                type="time"
                required
              />
            </div>
            <div class="quick-schedule">
              <button type="button" class="btn-quick" @click="setQuickSchedule('1h')">1小时后</button>
              <button type="button" class="btn-quick" @click="setQuickSchedule('tomorrow')">明天9:00</button>
              <button type="button" class="btn-quick" @click="setQuickSchedule('nextweek')">下周一</button>
            </div>
          </div>

          <div class="form-group">
            <label>目标渠道</label>
            <div class="channels-grid">
              <label v-for="ch in availableChannels" :key="ch.id" class="channel-checkbox">
                <input
                  type="checkbox"
                  :value="ch.id"
                  v-model="newPush.channels"
                />
                <span class="channel-icon">{{ ch.icon }}</span>
                <span class="channel-name">{{ ch.name }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="template">使用模板 (可选)</label>
            <select id="template" v-model="newPush.templateId">
              <option value="">不使用模板</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">
                {{ t.name }} ({{ t.channel }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="retries">重试次数</label>
            <select id="retries" v-model="newPush.maxRetries">
              <option :value="0">不重试</option>
              <option :value="1">1次</option>
              <option :value="3">3次</option>
              <option :value="5">5次</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showCreateModal = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? '创建中...' : '创建定时推送' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getScheduledPushes, createScheduledPush, cancelScheduledPush, deleteScheduledPush, getTemplates } from '../api';

interface ScheduledPush {
  id: string;
  name: string;
  content: string;
  scheduledTime: string;
  channels: string[];
  templateId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  metadata?: {
    retries?: number;
    maxRetries?: number;
    lastError?: string;
    lastRunAt?: string;
  };
}

interface Template {
  id: string;
  name: string;
  channel: string;
  content: string;
}

const loading = ref(false);
const creating = ref(false);
const scheduledPushes = ref<ScheduledPush[]>([]);
const templates = ref<Template[]>([]);
const showCreateModal = ref(false);
const filterStatus = ref<string>('all');

const today = new Date().toISOString().split('T')[0];

const statusFilters = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待执行' },
  { value: 'running', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' }
];

const availableChannels = [
  { id: 'email', name: '邮件', icon: '📧' },
  { id: 'sms', name: '短信', icon: '📱' },
  { id: 'push', name: '推送', icon: '🔔' },
  { id: 'wechat', name: '微信', icon: '💬' },
  { id: 'dingtalk', name: '钉钉', icon: '🚀' },
  { id: 'feishu', name: '飞书', icon: '📮' },
  { id: 'telegram', name: 'Telegram', icon: '✈️' },
  { id: 'slack', name: 'Slack', icon: '💼' },
  { id: 'discord', name: 'Discord', icon: '🎮' },
  { id: 'webpush', name: 'Web Push', icon: '🌐' }
];

const newPush = ref({
  name: '',
  content: '',
  date: today,
  time: '09:00',
  channels: [] as string[],
  templateId: '',
  maxRetries: 3
});

const filteredPushes = computed(() => {
  if (filterStatus.value === 'all') {
    return scheduledPushes.value;
  }
  return scheduledPushes.value.filter(p => p.status === filterStatus.value);
});

function getCountByStatus(status: string): number {
  if (status === 'all') return scheduledPushes.value.length;
  return scheduledPushes.value.filter(p => p.status === status).length;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return labels[status] || status;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setQuickSchedule(type: string) {
  const now = new Date();
  switch (type) {
    case '1h':
      now.setHours(now.getHours() + 1);
      break;
    case 'tomorrow':
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
      break;
    case 'nextweek':
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntilMonday);
      now.setHours(9, 0, 0, 0);
      break;
  }
  newPush.value.date = now.toISOString().split('T')[0];
  newPush.value.time = now.toTimeString().slice(0, 5);
}

async function loadScheduledPushes() {
  loading.value = true;
  try {
    const data = await getScheduledPushes('');
    scheduledPushes.value = data.scheduled || [];
  } catch (error) {
    console.error('加载定时推送失败:', error);
  } finally {
    loading.value = false;
  }
}

async function loadTemplates() {
  try {
    const data = await getTemplates('');
    templates.value = data.templates || [];
  } catch (error) {
    console.error('加载模板失败:', error);
  }
}

async function createScheduledPushHandler() {
  if (newPush.value.channels.length === 0) {
    alert('请至少选择一个渠道');
    return;
  }

  const scheduledTime = new Date(`${newPush.value.date}T${newPush.value.time}`).toISOString();

  creating.value = true;
  try {
    await createScheduledPush('', {
      name: newPush.value.name,
      content: newPush.value.content,
      scheduledTime,
      channels: newPush.value.channels,
      templateId: newPush.value.templateId || undefined,
      metadata: {
        maxRetries: newPush.value.maxRetries
      }
    });

    showCreateModal.value = false;
    newPush.value = {
      name: '',
      content: '',
      date: today,
      time: '09:00',
      channels: [],
      templateId: '',
      maxRetries: 3
    };
    await loadScheduledPushes();
  } catch (error) {
    console.error('创建定时推送失败:', error);
    alert('创建失败，请重试');
  } finally {
    creating.value = false;
  }
}

async function cancelPush(id: string) {
  if (!confirm('确定要取消这个定时推送吗？')) return;

  try {
    await cancelScheduledPush('', id);
    await loadScheduledPushes();
  } catch (error) {
    console.error('取消定时推送失败:', error);
    alert('取消失败，请重试');
  }
}

async function deletePush(id: string) {
  if (!confirm('确定要删除这个定时推送吗？')) return;

  try {
    await deleteScheduledPush('', id);
    await loadScheduledPushes();
  } catch (error) {
    console.error('删除定时推送失败:', error);
    alert('删除失败，请重试');
  }
}

async function testPush(push: ScheduledPush) {
  if (!confirm('确定要立即执行这个推送进行测试吗？')) return;

  try {
    await createScheduledPush('', {
      name: `[测试] ${push.name}`,
      content: push.content,
      scheduledTime: new Date().toISOString(),
      channels: push.channels,
      templateId: push.templateId
    });
    alert('测试推送已创建并立即执行');
    await loadScheduledPushes();
  } catch (error) {
    console.error('测试推送失败:', error);
    alert('测试推送失败，请重试');
  }
}

onMounted(() => {
  loadScheduledPushes();
  loadTemplates();
});
</script>

<style scoped>
.scheduled-push-manager {
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0 0 16px;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 16px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.filter-btn.active {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
}

.filter-btn .count {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
}

.filter-btn.active .count {
  background: rgba(255, 255, 255, 0.3);
}

.push-cards {
  display: grid;
  gap: 16px;
}

.push-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #ddd;
}

.push-card.status-pending {
  border-left-color: #1890ff;
}

.push-card.status-running {
  border-left-color: #faad14;
}

.push-card.status-completed {
  border-left-color: #52c41a;
}

.push-card.status-failed {
  border-left-color: #ff4d4f;
}

.push-card.status-cancelled {
  border-left-color: #999;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.pending {
  background: #e6f7ff;
  color: #1890ff;
}

.status-badge.running {
  background: #fffbe6;
  color: #faad14;
}

.status-badge.completed {
  background: #f6ffed;
  color: #52c41a;
}

.status-badge.failed {
  background: #fff2f0;
  color: #ff4d4f;
}

.status-badge.cancelled {
  background: #f5f5f5;
  color: #999;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: #f5f5f5;
}

.card-body {
  margin-bottom: 12px;
}

.push-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #333;
}

.push-content {
  margin: 0 0 12px;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.push-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.meta-item .label {
  color: #999;
  min-width: 70px;
}

.meta-item .value {
  color: #333;
}

.meta-item .channels {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.channel-tag {
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.push-metadata {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #eee;
}

.error-info .value.error {
  color: #ff4d4f;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.created-at {
  font-size: 12px;
  color: #999;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  padding: 0;
  line-height: 1;
}

.btn-close:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
}

.datetime-inputs {
  display: flex;
  gap: 12px;
}

.datetime-inputs input {
  flex: 1;
}

.quick-schedule {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-quick {
  padding: 4px 10px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-quick:hover {
  background: #e6e6e6;
}

.channels-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.channel-checkbox:hover {
  border-color: #1890ff;
}

.channel-checkbox input {
  width: auto;
}

.channel-icon {
  font-size: 18px;
}

.channel-name {
  font-size: 14px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  background: #1890ff;
  color: #fff;
}

.btn-primary:hover {
  background: #40a9ff;
}

.btn-primary:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
}

.btn-secondary:hover {
  background: #e6e6e6;
}

.btn-small {
  padding: 6px 12px;
  font-size: 13px;
}

.btn .icon {
  font-size: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #1890ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
