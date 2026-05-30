<template>
  <div class="scheduled-push-manager">
    <div class="panel">
      <div class="panel-header">
        <h2> {{ t('scheduled.title') }}</h2>
        <button class="btn btn-primary" @click="openCreateModal" :disabled="creating">
          + {{ t('scheduled.create') }}
        </button>
      </div>

      <div v-if="loading && scheduledPushes.length === 0" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('common.loading') || '加载中...' }}</span>
      </div>

      <div v-else-if="scheduledPushes.length === 0" class="empty-state">
        <div class="empty-icon"></div>
        <p>{{ t('scheduled.empty') }}</p>
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
          <div v-for="push in filteredPushes" :key="push.id" class="push-card">
            <div class="push-main">
              <div class="push-top">
                <div class="push-name-row">
                  <h3 class="push-name">{{ push.title }}</h3>
                  <span class="status-badge" :class="push.status">{{ getStatusLabel(push.status) }}</span>
                </div>
              </div>
              <div class="push-body">
                <div class="field-row">
                  <span class="field-label">执行时间</span>
                  <span class="field-value">{{ formatDateTime(push.scheduledAt) }}</span>
                </div>
                <div class="field-row">
                  <span class="field-label">渠道</span>
                  <span class="field-value channels">
                    <span v-for="ch in push.channels" :key="ch" class="tag tag-channel">{{ getChannelName(ch) }}</span>
                  </span>
                </div>
                <div class="field-row" v-if="push.content">
                  <span class="field-label">内容</span>
                  <span class="field-value">{{ push.content }}</span>
                </div>
                <div class="field-row" v-if="push.templateId">
                  <span class="field-label">模板</span>
                  <span class="field-value">{{ getTemplateName(push.templateId) }}</span>
                </div>
              </div>
            </div>
            <div class="push-actions">
              <button v-if="push.status === 'pending'" class="action-btn action-test" @click="testPush(push)">测试</button>
              <button v-if="push.status === 'pending'" class="action-btn action-cancel" @click="cancelPush(push.id)">取消</button>
              <button class="action-btn action-delete" @click="deletePush(push.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('scheduled.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>

        <form @submit.prevent="createScheduledPushHandler" class="modal-body">
          <div class="form-group">
            <label>任务名称</label>
            <input
              v-model="newPush.name"
              type="text"
              placeholder="例如: 每日早报"
              required
            />
          </div>

          <div class="form-group">
            <label>消息内容</label>
            <textarea
              v-model="newPush.content"
              placeholder="输入推送内容..."
              rows="3"
              required
            ></textarea>
          </div>

          <div class="form-group">
            <label>执行时间</label>
            <div class="schedule-type-selector">
              <button
                type="button"
                class="schedule-type-btn"
                :class="{ active: scheduleType === 'once' }"
                @click="scheduleType = 'once'"
              >
                单次执行
              </button>
              <button
                type="button"
                class="schedule-type-btn"
                :class="{ active: scheduleType === 'recurring' }"
                @click="scheduleType = 'recurring'"
              >
                重复执行
              </button>
            </div>

            <div v-if="scheduleType === 'once'" class="datetime-section">
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

            <div v-else class="recurring-section">
              <div class="recurring-options">
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'hourly' }"
                  @click="recurringType = 'hourly'"
                >
                  每小时
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'interval' }"
                  @click="recurringType = 'interval'"
                >
                  自定义间隔
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'daily' }"
                  @click="recurringType = 'daily'"
                >
                  每天
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'weekly' }"
                  @click="recurringType = 'weekly'"
                >
                  每周
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'monthly' }"
                  @click="recurringType = 'monthly'"
                >
                  每月
                </button>
              </div>

              <div v-if="recurringType === 'interval'" class="interval-input">
                <label class="interval-label">每</label>
                <input
                  v-model.number="intervalHours"
                  type="number"
                  min="1"
                  max="168"
                  class="interval-number"
                />
                <label class="interval-label">小时执行一次</label>
              </div>

              <div v-if="recurringType !== 'hourly' && recurringType !== 'interval'" class="recurring-time">
                <label class="recurring-time-label">执行时间</label>
                <input
                  v-model="newPush.time"
                  type="time"
                  class="recurring-time-input"
                  required
                />
              </div>

              <div v-if="recurringType === 'weekly'" class="weekday-selector">
                <label class="weekday-label">选择星期</label>
                <div class="weekday-options">
                  <button
                    type="button"
                    v-for="day in weekDays"
                    :key="day.value"
                    class="weekday-btn"
                    :class="{ active: selectedWeekDays.includes(day.value) }"
                    @click="toggleWeekDay(day.value)"
                  >
                    {{ day.label }}
                  </button>
                </div>
              </div>

              <div v-if="recurringType === 'monthly'" class="monthday-selector">
                <label class="weekday-label">选择日期</label>
                <div class="monthday-options">
                  <button
                    type="button"
                    v-for="day in monthDays"
                    :key="day"
                    class="monthday-btn"
                    :class="{ active: selectedMonthDays.includes(day) }"
                    @click="toggleMonthDay(day)"
                  >
                    {{ day }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>目标渠道</label>
            <div class="channels-grid">
              <label v-for="ch in availableChannels" :key="ch.id" class="channel-checkbox">
                <input type="checkbox" :value="ch.id" v-model="newPush.channels" />
                <span class="channel-icon">{{ ch.icon }}</span>
                <span class="channel-name">{{ ch.name }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>使用模板 (可选)</label>
            <select v-model="newPush.templateId" @change="onTemplateChange">
              <option value="">不使用模板</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">
                {{ t.name }} ({{ (t.channels || []).join(', ') }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>重试次数</label>
            <select v-model="newPush.maxRetries">
              <option :value="0">不重试</option>
              <option :value="1">1次</option>
              <option :value="3">3次</option>
              <option :value="5">5次</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? (t('common.saving') || '创建中...') : '创建定时推送' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { t } from '@/i18n';
import { getScheduledPushes, createScheduledPush, cancelScheduledPush, deleteScheduledPush, getTemplates } from '@/api';

interface ScheduledPush {
  id: string;
  title: string;
  content: string;
  scheduledAt: string;
  channels: string[];
  templateId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdBy?: string;
}

interface Template {
  id: string;
  name: string;
  title: string;
  content: string;
  channels?: string[];
}

const props = defineProps<{
  accessToken: string;
}>();

const loading = ref(false);
const creating = ref(false);
const scheduledPushes = ref<ScheduledPush[]>([]);
const templates = ref<Template[]>([]);
const showCreateModal = ref(false);
const filterStatus = ref<string>('all');

const today = new Date().toISOString().split('T')[0];

const scheduleType = ref<'once' | 'recurring'>('once');
const recurringType = ref<'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval'>('daily');
const selectedWeekDays = ref<number[]>([1, 2, 3, 4, 5]);
const selectedMonthDays = ref<number[]>([1, 15]);
const intervalHours = ref(2);

const weekDays = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' }
];

const monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

const statusFilters = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待执行' },
  { value: 'processing', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' }
];

const availableChannels = [
  { id: 'wework', name: '企业微信', icon: '💼' },
  { id: 'dingtalk', name: '钉钉', icon: '🚀' },
  { id: 'feishu', name: '飞书', icon: '📮' },
  { id: 'telegram', name: 'Telegram', icon: '✈️' },
  { id: 'bark', name: 'Bark', icon: '📱' },
  { id: 'ntfy', name: 'Ntfy', icon: '🔔' },
  { id: 'email', name: '邮件', icon: '' },
  { id: 'slack', name: 'Slack', icon: '💼' },
  { id: 'discord', name: 'Discord', icon: '🎮' }
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
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getChannelName(ch: string): string {
  const channelMap: Record<string, string> = {
    wework: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    telegram: 'Telegram',
    bark: 'Bark',
    ntfy: 'Ntfy',
    email: '邮件',
    slack: 'Slack',
    discord: 'Discord',
    webpush: 'Web Push',
  };
  return channelMap[ch] || ch;
}

function getTemplateName(templateId: string): string {
  const template = templates.value.find(t => t.id === templateId);
  return template ? template.name : templateId;
}

function toggleWeekDay(day: number) {
  const idx = selectedWeekDays.value.indexOf(day);
  if (idx === -1) {
    selectedWeekDays.value.push(day);
  } else {
    selectedWeekDays.value.splice(idx, 1);
  }
}

function toggleMonthDay(day: number) {
  const idx = selectedMonthDays.value.indexOf(day);
  if (idx === -1) {
    selectedMonthDays.value.push(day);
  } else {
    selectedMonthDays.value.splice(idx, 1);
  }
}

function resetForm() {
  newPush.value = {
    name: '',
    content: '',
    date: today,
    time: '09:00',
    channels: [],
    templateId: '',
    maxRetries: 3
  };
  scheduleType.value = 'once';
  recurringType.value = 'daily';
  selectedWeekDays.value = [1, 2, 3, 4, 5];
  selectedMonthDays.value = [1, 15];
  intervalHours.value = 2;
}

async function openCreateModal() {
  resetForm();
  showCreateModal.value = true;
}

function closeModal() {
  showCreateModal.value = false;
  resetForm();
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

function onTemplateChange() {
  const template = templates.value.find(t => t.id === newPush.value.templateId);
  if (template) {
    newPush.value.name = template.name;
    newPush.value.content = template.content;
    // 自动选择模板的渠道
    if (template.channels && template.channels.length > 0) {
      newPush.value.channels = [...template.channels];
    }
  } else {
    // 取消选择模板时不清空用户已填写的内容，只清空渠道选择
    newPush.value.channels = [];
  }
}

async function loadScheduledPushes() {
  if (!props.accessToken) return;
  loading.value = true;
  try {
    const data = await getScheduledPushes(props.accessToken);
    scheduledPushes.value = data.scheduled || [];
  } catch (error) {
    console.error('加载定时推送失败:', error);
  } finally {
    loading.value = false;
  }
}

async function loadTemplates() {
  if (!props.accessToken) return;
  try {
    const data = await getTemplates(props.accessToken);
    templates.value = data.templates || [];
  } catch (error) {
    console.error('加载模板失败:', error);
  }
}

async function createScheduledPushHandler() {
  if (!props.accessToken) {
    alert('请先登录');
    return;
  }
  if (newPush.value.channels.length === 0) {
    alert('请至少选择一个渠道');
    return;
  }
  if (!newPush.value.name.trim()) {
    alert('请输入任务名称');
    return;
  }
  if (!newPush.value.content.trim()) {
    alert('请输入消息内容');
    return;
  }

  // 构建执行时间
  let scheduledTime = new Date(`${newPush.value.date}T${newPush.value.time}`);
  if (isNaN(scheduledTime.getTime())) {
    alert('请选择有效的执行时间');
    return;
  }

  // 单次执行：如果时间已过，提示用户
  if (scheduleType.value === 'once' && scheduledTime <= new Date()) {
    alert('执行时间必须是将来的时间，请选择明天的日期或更晚的时间');
    return;
  }

  // 重复执行：如果时间已过，自动调整为明天的同一时间
  if (scheduleType.value === 'recurring' && scheduledTime <= new Date()) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [hours, minutes] = newPush.value.time.split(':').map(Number);
    tomorrow.setHours(hours, minutes, 0, 0);
    scheduledTime = tomorrow;
  }

  creating.value = true;
  try {
    await createScheduledPush(props.accessToken, {
      title: newPush.value.name,
      content: newPush.value.content,
      scheduledAt: scheduledTime.toISOString(),
      channels: newPush.value.channels,
      templateId: newPush.value.templateId || undefined,
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
  if (!props.accessToken) return;
  if (!confirm('确定要取消这个定时推送吗？')) return;

  try {
    await cancelScheduledPush(props.accessToken, id);
    await loadScheduledPushes();
  } catch (error) {
    console.error('取消定时推送失败:', error);
    alert('取消失败，请重试');
  }
}

async function deletePush(id: string) {
  if (!props.accessToken) return;
  if (!confirm('确定要删除这个定时推送吗？')) return;

  try {
    await deleteScheduledPush(props.accessToken, id);
    await loadScheduledPushes();
  } catch (error) {
    console.error('删除定时推送失败:', error);
    alert('删除失败，请重试');
  }
}

async function testPush(push: ScheduledPush) {
  if (!props.accessToken) return;
  if (!confirm('确定要立即执行这个推送进行测试吗？')) return;

  try {
    await createScheduledPush(props.accessToken, {
      title: `[测试] ${push.name}`,
      content: push.content,
      scheduledAt: new Date().toISOString(),
      channels: push.channels,
      templateId: push.templateId,
    });
    alert('测试推送已创建并立即执行');
    await loadScheduledPushes();
  } catch (error) {
    console.error('测试推送失败:', error);
    alert('测试推送失败，请重试');
  }
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadScheduledPushes();
  loadTemplates();
  // 每5秒刷新一次定时推送状态
  refreshTimer = setInterval(() => {
    loadScheduledPushes();
  }, 5000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

watch(() => props.accessToken, () => {
  loadScheduledPushes();
  loadTemplates();
});
</script>

<style scoped>
.scheduled-push-manager {
  padding: 0;
}

.panel {
  background: var(--bg-panel, white);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.panel-header {
  height: 50px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel h2 {
  font-size: 18px;
  color: var(--text-primary, #1a1a2e);
  margin: 0;
  padding: 0;
  line-height: 36px;
}

.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

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
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary, #666);
}

.filter-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.filter-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
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
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.push-card {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  background: white;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  transition: all 0.25s ease;
  overflow: hidden;
}

.push-card:hover {
  border-color: #e0e0e0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.push-main {
  flex: 1;
  min-width: 0;
  padding: 24px;
}

.push-top {
  margin-bottom: 16px;
}

.push-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.push-name {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}

.push-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 13px;
}

.field-label {
  color: #999;
  min-width: 50px;
  flex-shrink: 0;
}

.field-value {
  color: #333;
}

.field-value.channels {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.push-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  padding: 20px;
  border-left: 1px solid #f5f5f5;
  background: #fafafa;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.pending {
  background: #667eea20;
  color: #667eea;
}

.status-badge.processing {
  background: #faad1420;
  color: #faad14;
}

.status-badge.completed {
  background: #52c41a20;
  color: #52c41a;
}

.status-badge.failed {
  background: #ff4d4f20;
  color: #ff4d4f;
}

.action-btn {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  text-align: center;
  min-width: 60px;
}

.action-test {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px 8px 0 0;
}

.action-test:hover {
  opacity: 0.9;
}

.action-cancel {
  background: #faad14;
  color: white;
}

.action-cancel:hover {
  background: #d99a0b;
}

.action-delete {
  background: #ff4757;
  color: white;
  border-radius: 0 0 8px 8px;
}

.action-delete:hover {
  background: #ff3742;
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
  background: var(--bg-panel, white);
  border-radius: 12px;
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
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #1a1a2e);
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
  font-weight: 600;
  color: var(--text-primary, #333);
  font-size: 14px;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
  background: var(--bg-panel, white);
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
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
  background: var(--bg-secondary, #f8f9fa);
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-quick:hover {
  border-color: #667eea;
}

.schedule-type-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.schedule-type-btn {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #666);
}

.schedule-type-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
  color: #667eea;
}

.datetime-section {
  margin-top: 12px;
}

.recurring-section {
  margin-top: 12px;
}

.recurring-options {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.recurring-btn {
  flex: 1;
  min-width: 70px;
  padding: 8px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #666);
}

.recurring-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
  color: #667eea;
}

.interval-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.interval-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  white-space: nowrap;
}

.interval-number {
  width: 60px;
  padding: 6px 10px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  font-family: inherit;
  background: var(--bg-panel, white);
}

.interval-number:focus {
  outline: none;
  border-color: #667eea;
}

.recurring-time {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recurring-time-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  white-space: nowrap;
}

.recurring-time-input {
  flex: 1;
  max-width: 120px;
}

.weekday-selector {
  margin-top: 12px;
}

.weekday-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 8px;
}

.weekday-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.weekday-btn {
  width: 36px;
  height: 36px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  border-radius: 50%;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #666);
}

.weekday-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.monthday-selector {
  margin-top: 12px;
}

.monthday-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.monthday-btn {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary, #666);
}

.monthday-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.channels-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.channel-checkbox:hover {
  border-color: #667eea;
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
  border-top: 1px solid var(--border-color, #f0f0f0);
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary, #f8f9fa);
  color: var(--text-primary, #333);
  border: 2px solid var(--border-color, #e0e0e0);
}

.btn-secondary:hover {
  border-color: #667eea;
}

.btn-small {
  padding: 6px 14px;
  font-size: 13px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
