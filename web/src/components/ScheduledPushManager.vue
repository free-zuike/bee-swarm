<template>
  <div class="scheduled-push-manager">
    <div class="panel">
      <div class="panel-header">
        <h2>{{ t('scheduled.title') }}</h2>
        <button class="btn btn-primary" @click="openCreateModal" :disabled="creating">
          + {{ t('scheduled.create') }}
        </button>
      </div>

      <div v-if="loading && scheduledPushes.length === 0" class="loading-state">
        <div class="spinner"></div>
        <span>{{ t('label.loading') }}</span>
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
            {{ t(status.label) }}
            <span class="count">{{ getCountByStatus(status.value) }}</span>
          </button>
        </div>

        <div class="push-cards">
          <div v-for="push in filteredPushes" :key="push.id" class="push-card">
            <div class="push-main">
              <div class="push-top">
                <div class="push-name-row">
                  <h3 class="push-name">{{ push.title }}</h3>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="status-badge" :class="push.status" style="margin: 0;">
                      {{ t(getStatusLabel(push.status)) }}
                    </span>
                    <span class="type-badge" :class="push.scheduleType || 'once'">
                      {{ push.scheduleType === 'recurring' ? t('scheduled.scheduleType.recurring') : t('scheduled.scheduleType.once') }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="push-body">
                <div class="field-row">
                  <span class="field-label">{{ t('scheduled.label.executeTime') }}</span>
                  <span class="field-value">{{ formatDateTime(push.scheduledAt) }}</span>
                </div>
                <div class="field-row">
                  <span class="field-label">{{ t('scheduled.label.channels') }}</span>
                  <span class="field-value channels">
                    <span v-for="ch in push.channels" :key="ch" class="tag tag-channel">{{
                      getChannelName(ch)
                    }}</span>
                  </span>
                </div>
                <div class="field-row" v-if="push.content">
                  <span class="field-label">{{ t('scheduled.label.content') }}</span>
                  <span class="field-value">{{ push.content }}</span>
                </div>
                <div class="field-row" v-if="push.templateId">
                  <span class="field-label">{{ t('scheduled.label.template') }}</span>
                  <span class="field-value">{{ getTemplateName(push.templateId) }}</span>
                </div>
              </div>
            </div>
            <div class="push-actions">
              <button
                v-if="push.status === 'pending'"
                class="action-btn action-test"
                @click="confirmTestPush(push)"
              >
                {{ t('scheduled.button.test') }}
              </button>
              <button
                v-if="push.status === 'pending'"
                class="action-btn action-cancel"
                @click="confirmCancelPush(push)"
              >
                {{ t('scheduled.button.cancelTask') }}
              </button>
              <button
                v-if="push.status === 'completed' || push.status === 'failed'"
                class="action-btn action-renew"
                @click="openRenewModal(push)"
              >
                {{ t('scheduled.button.renew') || '续订' }}
              </button>
              <button class="action-btn action-delete" @click="confirmDeletePush(push)">
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('scheduled.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>

        <form @submit.prevent="createScheduledPushHandler" class="modal-body">
          <div class="form-group">
            <label>{{ t('scheduled.label.taskName') }}</label>
            <input
              v-model="newPush.name"
              type="text"
              :placeholder="t('templates.namePlaceholder')"
              required
            />
          </div>

          <div class="form-group">
            <label>{{ t('scheduled.label.messageContent') }}</label>
            <textarea
              v-model="newPush.content"
              :placeholder="t('templates.contentPlaceholder')"
              rows="3"
              required
            ></textarea>
          </div>

          <div class="form-group">
            <label>{{ t('scheduled.label.executeTime') }}</label>
            <div class="schedule-type-selector">
              <button
                type="button"
                class="schedule-type-btn"
                :class="{ active: scheduleType === 'once' }"
                @click="scheduleType = 'once'"
              >
                {{ t('scheduled.label.executeOnce') }}
              </button>
              <button
                type="button"
                class="schedule-type-btn"
                :class="{ active: scheduleType === 'recurring' }"
                @click="scheduleType = 'recurring'"
              >
                {{ t('scheduled.label.repeat') }}
              </button>
            </div>

            <div v-if="scheduleType === 'once'" class="datetime-section">
              <div class="datetime-inputs">
                <input v-model="newPush.date" type="date" :min="today" required />
                <input v-model="newPush.time" type="time" required />
              </div>
              <div class="quick-schedule">
                <button type="button" class="btn-quick" @click="setQuickSchedule('1h')">
                  {{ t('label.1HourLater') }}
                </button>
                <button type="button" class="btn-quick" @click="setQuickSchedule('tomorrow')">
                  {{ t('label.tomorrow9am') }}
                </button>
                <button type="button" class="btn-quick" @click="setQuickSchedule('nextweek')">
                  {{ t('label.nextMonday') }}
                </button>
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
                  {{ t('interval.hourly') }}
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'daily' }"
                  @click="recurringType = 'daily'"
                >
                  {{ t('scheduled.label.daily') }}
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'weekly' }"
                  @click="recurringType = 'weekly'"
                >
                  {{ t('scheduled.label.weekly') }}
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'monthly' }"
                  @click="recurringType = 'monthly'"
                >
                  {{ t('scheduled.label.monthly') }}
                </button>
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'yearly' }"
                  @click="recurringType = 'yearly'"
                >
                  {{ t('scheduled.label.yearly') }}
                </button>
              </div>

              <div
                v-if="recurringType !== 'hourly'"
                class="recurring-time"
              >
                <label class="recurring-time-label">{{ t('scheduled.label.executeTime') }}</label>
                <input v-model="newPush.time" type="time" class="recurring-time-input" required />
              </div>

              <div v-if="recurringType === 'weekly'" class="weekday-selector">
                <label class="weekday-label">{{ t('scheduled.label.selectWeekday') }}</label>
                <div class="weekday-options">
                  <button
                    type="button"
                    v-for="day in weekDays"
                    :key="day.value"
                    class="weekday-btn"
                    :class="{ active: selectedWeekDays.includes(day.value) }"
                    @click="toggleWeekDay(day.value)"
                  >
                    {{ t(day.label) }}
                  </button>
                </div>
              </div>

              <div v-if="recurringType === 'monthly'" class="monthday-selector">
                <label class="weekday-label">{{ t('scheduled.label.selectDate') }}</label>
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

              <div v-if="recurringType === 'cron'" class="cron-input">
                <label class="cron-label">{{ t('scheduled.label.cronExpression') }}</label>
                <input
                  v-model="cronExpression"
                  type="text"
                  :placeholder="t('scheduled.label.cronPlaceholder')"
                  class="cron-input-field"
                />
                <div class="cron-help">
                  <p class="cron-help-title">{{ t('scheduled.label.commonExamples') }}</p>
                  <code>{{ t('scheduled.label.every5Min') }}</code><br />
                  <code>{{ t('scheduled.label.every2Hour') }}</code><br />
                  <code>{{ t('scheduled.label.weekday9am') }}</code><br />
                  <code>{{ t('scheduled.label.month1st0am') }}</code><br />
                  <code>{{ t('scheduled.label.daily91218') }}</code>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>{{ t('scheduled.label.targetChannels') }}</label>
            <div class="channels-grid">
              <label v-for="ch in availableChannels" :key="ch.id" class="channel-checkbox">
                <input type="checkbox" :value="ch.id" v-model="newPush.channels" />
                <span class="channel-icon">{{ ch.icon }}</span>
                <span>{{ getChannelName(ch.id) }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>{{ t('scheduled.label.useTemplate') }}</label>
            <select v-model="newPush.templateId" @change="onTemplateChange">
              <option value="">{{ t('scheduled.label.noTemplate') }}</option>
              <option v-for="template in templates" :key="template.id" :value="template.id">
                {{ template.name }} ({{ (template.channels || []).map(ch => getChannelName(ch)).join(', ') }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>{{ t('scheduled.label.maxRetries') }}</label>
            <select v-model="newPush.maxRetries">
              <option :value="0">{{ t('scheduled.label.noRetry') }}</option>
              <option :value="1">{{ t('scheduled.label.once') }}</option>
              <option :value="3">{{ t('scheduled.label.threeTimes') }}</option>
              <option :value="5">{{ t('scheduled.label.fiveTimes') }}</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              {{ t('common.cancel') }}
            </button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? t('common.saving') : t('scheduled.create') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showDeleteConfirm"
      class="modal-overlay"
      @click.self="showDeleteConfirm = false; actionTarget = null"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('scheduled.message.deleteConfirm') }}</h3>
          <button class="btn-close" @click="showDeleteConfirm = false; actionTarget = null">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.confirm.deleteScheduled', { title: actionTarget?.title || '' }) }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showDeleteConfirm = false; actionTarget = null">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-danger" @click="doDelete" :disabled="deleting">
              {{ deleting ? t('label.deleting') : t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showCancelConfirm"
      class="modal-overlay"
      @click.self="showCancelConfirm = false; actionTarget = null"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('scheduled.message.cancel') }}</h3>
          <button class="btn-close" @click="showCancelConfirm = false; actionTarget = null">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.confirm.cancelScheduled', { title: actionTarget?.title || '' }) }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showCancelConfirm = false; actionTarget = null">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-danger" @click="doCancel" :disabled="deleting">
              {{ deleting ? t('scheduled.message.canceling') : t('scheduled.message.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showTestConfirm"
      class="modal-overlay"
      @click.self="showTestConfirm = false; actionTarget = null"
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('scheduled.message.testConfirm') }}</h3>
          <button class="btn-close" @click="showTestConfirm = false; actionTarget = null">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.confirm.testScheduled', { title: actionTarget?.title || '' }) }}</p>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="showTestConfirm = false; actionTarget = null">
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-primary" @click="doTest" :disabled="testRunning">
              {{ testRunning ? t('scheduled.message.testing') : t('scheduled.message.executeNow') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useTranslation } from '@/i18n';
import { useGlobalToast } from '@/composables/useToast';
import {
  getScheduledPushes,
  createScheduledPush,
  cancelScheduledPush,
  deleteScheduledPush,
  getTemplates,
} from '@/api';

const t = useTranslation();
const { showToast } = useGlobalToast();

interface ScheduledPush {
  id: string;
  title: string;
  content: string;
  scheduledAt: string;
  channels: string[];
  templateId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdBy?: string;
  scheduleType?: 'once' | 'recurring';
  recurringType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron' | 'intervalMonth' | 'yearly' | 'intervalYear';
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
const deleting = ref(false);
const testRunning = ref(false);
const scheduledPushes = ref<ScheduledPush[]>([]);
const templates = ref<Template[]>([]);
const showModal = ref(false);
const showDeleteConfirm = ref(false);
const showTestConfirm = ref(false);
const showCancelConfirm = ref(false);
const showRenewModal = ref(false);
const actionTarget = ref<ScheduledPush | null>(null);
const renewPush = ref<ScheduledPush | null>(null);
const filterStatus = ref<string>('all');

const today = new Date().toISOString().split('T')[0];

const scheduleType = ref<'once' | 'recurring'>('once');
const recurringType = ref<'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
const selectedWeekDays = ref<number[]>([1, 2, 3, 4, 5]);
const selectedMonthDays = ref<number[]>([1, 15]);

const weekDays = [
  { value: 1, label: 'label.monday' },
  { value: 2, label: 'label.tuesday' },
  { value: 3, label: 'label.wednesday' },
  { value: 4, label: 'label.thursday' },
  { value: 5, label: 'label.friday' },
  { value: 6, label: 'label.saturday' },
  { value: 0, label: 'label.sunday' },
];

const monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

const statusFilters = [
  { value: 'all', label: 'scheduled.filter.all' },
  { value: 'pending', label: 'scheduled.filter.pending' },
  { value: 'running', label: 'scheduled.filter.running' },
  { value: 'completed', label: 'scheduled.filter.completed' },
  { value: 'failed', label: 'scheduled.filter.failed' },
];

const availableChannels = [
  { id: 'wework', icon: '💼' },
  { id: 'dingtalk', icon: '🚀' },
  { id: 'feishu', icon: '📮' },
  { id: 'telegram', icon: '✈️' },
  { id: 'bark', icon: '📱' },
  { id: 'ntfy', icon: '🔔' },
  { id: 'email', icon: '📧' },
  { id: 'slack', icon: '💼' },
  { id: 'discord', icon: '🎮' },
];

const newPush = ref({
  name: '',
  content: '',
  date: today,
  time: '09:00',
  channels: [] as string[],
  templateId: '',
  maxRetries: 3,
});

const filteredPushes = computed(() => {
  if (filterStatus.value === 'all') {
    return scheduledPushes.value;
  }
  return scheduledPushes.value.filter((p) => p.status === filterStatus.value);
});

function getCountByStatus(status: string): number {
  if (status === 'all') return scheduledPushes.value.length;
  return scheduledPushes.value.filter((p) => p.status === status).length;
}

function getStatusLabel(status: string): string {
  const labelMap: Record<string, string> = {
    pending: 'scheduled.filter.pending',
    running: 'scheduled.filter.running',
    completed: 'scheduled.filter.completed',
    failed: 'scheduled.filter.failed',
    cancelled: 'scheduled.filter.pending',
  };
  return labelMap[status] || status;
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getChannelName(ch: string): string {
  return t(`channel.${ch}`) || ch;
}

function getTemplateName(templateId: string): string {
  const template = templates.value.find((t) => t.id === templateId);
  return template ? template.name : templateId;
}

function toggleWeekDay(day: number): void {
  const idx = selectedWeekDays.value.indexOf(day);
  if (idx === -1) {
    selectedWeekDays.value.push(day);
  } else {
    selectedWeekDays.value.splice(idx, 1);
  }
}

function toggleMonthDay(day: number): void {
  const idx = selectedMonthDays.value.indexOf(day);
  if (idx === -1) {
    selectedMonthDays.value.push(day);
  } else {
    selectedMonthDays.value.splice(idx, 1);
  }
}

function resetForm(): void {
  newPush.value = {
    name: '',
    content: '',
    date: today,
    time: '09:00',
    channels: [],
    templateId: '',
    maxRetries: 3,
  };
  scheduleType.value = 'once';
  recurringType.value = 'daily';
  selectedWeekDays.value = [1, 2, 3, 4, 5];
  selectedMonthDays.value = [1, 15];
}

function openCreateModal(): void {
  resetForm();
  showModal.value = true;
}

function openRenewModal(push: ScheduledPush): void {
  renewPush.value = push;
  resetForm();
  newPush.value.name = push.title;
  newPush.value.content = push.content || '';
  newPush.value.channels = [...push.channels];
  if (push.templateId) {
    newPush.value.templateId = push.templateId;
  }
  if (push.scheduleType) {
    scheduleType.value = push.scheduleType;
  }
  if (push.recurringType) {
    recurringType.value = push.recurringType as any;
  }
  showModal.value = true;
}

function closeModal(): void {
  showModal.value = false;
  renewPush.value = null;
  resetForm();
}

function setQuickSchedule(type: string): void {
  const now = new Date();
  switch (type) {
    case '1h':
      now.setHours(now.getHours() + 1);
      break;
    case 'tomorrow':
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
      break;
    case 'nextweek': {
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntilMonday);
      now.setHours(9, 0, 0, 0);
      break;
    }
  }
  newPush.value.date = now.toISOString().split('T')[0];
  newPush.value.time = now.toTimeString().slice(0, 5);
}

function onTemplateChange(): void {
  const template = templates.value.find((t) => t.id === newPush.value.templateId);
  if (template) {
    newPush.value.name = template.name;
    newPush.value.content = template.content;
    if (template.channels && template.channels.length > 0) {
      newPush.value.channels = [...template.channels];
    }
  } else {
    newPush.value.channels = [];
  }
}

async function loadScheduledPushes(): Promise<void> {
  if (!props.accessToken) return;
  loading.value = true;
  try {
    const data = await getScheduledPushes(props.accessToken);
    scheduledPushes.value = data.scheduled || [];
  } catch (error) {
    console.error('Failed to load scheduled pushes:', error);
  } finally {
    loading.value = false;
  }
}

async function loadTemplates(): Promise<void> {
  if (!props.accessToken) return;
  try {
    const data = await getTemplates(props.accessToken);
    templates.value = data.templates || [];
  } catch (error) {
    console.error('Failed to load templates:', error);
  }
}

async function createScheduledPushHandler(): Promise<void> {
  if (!props.accessToken) {
    showToast(t('message.pleaseLoginFirst'), 'error');
    return;
  }
  if (newPush.value.channels.length === 0) {
    showToast(t('message.pleaseSelectChannel'), 'error');
    return;
  }
  if (!newPush.value.name.trim()) {
    showToast(t('message.pleaseEnterTaskName'), 'error');
    return;
  }
  if (!newPush.value.content.trim()) {
    showToast(t('message.pleaseEnterMessageContent'), 'error');
    return;
  }

  let scheduledTime = new Date(`${newPush.value.date}T${newPush.value.time}`);
  if (isNaN(scheduledTime.getTime())) {
    showToast(t('message.pleaseSelectValidTime'), 'error');
    return;
  }

  if (scheduleType.value === 'once' && scheduledTime <= new Date()) {
    showToast(t('message.timeMustBeFuture'), 'error');
    return;
  }

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
      scheduleType: scheduleType.value,
      recurringType: scheduleType.value === 'recurring' ? recurringType.value : undefined,
      selectedWeekDays: recurringType.value === 'weekly' ? selectedWeekDays.value : undefined,
      selectedMonthDays: recurringType.value === 'monthly' ? selectedMonthDays.value : undefined,
    });

    showModal.value = false;
    newPush.value = {
      name: '',
      content: '',
      date: today,
      time: '09:00',
      channels: [],
      templateId: '',
      maxRetries: 3,
    };
    showToast(t('message.createScheduledSuccess'), 'success');
    await loadScheduledPushes();
  } catch (error) {
    console.error('Failed to create scheduled push:', error);
    showToast(t('message.createFailedRetry'), 'error');
  } finally {
    creating.value = false;
  }
}

function confirmDeletePush(push: ScheduledPush): void {
  actionTarget.value = push;
  showDeleteConfirm.value = true;
}

async function doDelete(): Promise<void> {
  if (!props.accessToken || !actionTarget.value) return;
  deleting.value = true;
  try {
    await deleteScheduledPush(props.accessToken, actionTarget.value.id);
    await loadScheduledPushes();
  } catch (error) {
    console.error('Failed to delete scheduled push:', error);
  } finally {
    deleting.value = false;
    showDeleteConfirm.value = false;
    actionTarget.value = null;
  }
}

function confirmCancelPush(push: ScheduledPush): void {
  actionTarget.value = push;
  showCancelConfirm.value = true;
}

async function doCancel(): Promise<void> {
  if (!props.accessToken || !actionTarget.value) return;
  deleting.value = true;
  try {
    await cancelScheduledPush(props.accessToken, actionTarget.value.id);
    await loadScheduledPushes();
  } catch (error) {
    console.error('Failed to cancel scheduled push:', error);
  } finally {
    deleting.value = false;
    showCancelConfirm.value = false;
    actionTarget.value = null;
  }
}

function confirmTestPush(push: ScheduledPush): void {
  actionTarget.value = push;
  showTestConfirm.value = true;
}

async function doTest(): Promise<void> {
  if (!props.accessToken || !actionTarget.value) return;
  testRunning.value = true;
  try {
    await createScheduledPush(props.accessToken, {
      title: `[Test] ${actionTarget.value.title}`,
      content: actionTarget.value.content,
      scheduledAt: new Date().toISOString(),
      channels: actionTarget.value.channels,
      templateId: actionTarget.value.templateId,
    });
    showToast(t('scheduled.message.allSuccess'), 'success');
    await loadScheduledPushes();
  } catch (error) {
    console.error('Failed to test push:', error);
    showToast(t('scheduled.message.someFailed'), 'error');
  } finally {
    testRunning.value = false;
    showTestConfirm.value = false;
    actionTarget.value = null;
  }
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadScheduledPushes();
  loadTemplates();
  refreshTimer = setInterval(() => {
    loadScheduledPushes();
  }, 5000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

watch(
  () => props.accessToken,
  () => {
    loadScheduledPushes();
    loadTemplates();
  }
);
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
  min-width: 80px;
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

.status-badge.running {
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

.type-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.type-badge.once {
  background: #13c2c220;
  color: #13c2c2;
}

.type-badge.recurring {
  background: #722ed120;
  color: #722ed1;
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

.action-renew {
  background: #13c2c2;
  color: white;
}

.action-renew:hover {
  background: #0fa3a3;
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

.modal-small {
  max-width: 420px;
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
  font-size: 13px;
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

.btn-danger {
  background: #ff4d4f;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #ff7875;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.cron-input {
  margin-top: 12px;
}

.cron-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 8px;
}

.cron-input-field {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  transition: border-color 0.2s;
}

.cron-input-field:focus {
  outline: none;
  border-color: #667eea;
}

.cron-help {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary, #f8f9fa);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-secondary, #666);
}

.cron-help-title {
  margin: 0 0 4px;
  font-weight: 600;
  font-size: 12px;
}

.cron-help code {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-panel, white);
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #667eea;
  min-width: 80px;
}

@media (max-width: 768px) {
  .panel {
    padding: 16px;
  }

  .panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    height: auto;
    margin-bottom: 16px;
  }

  .panel-header h2 {
    font-size: 16px;
    line-height: normal;
  }

  .filter-bar {
    gap: 6px;
    margin-bottom: 16px;
  }

  .filter-btn {
    padding: 5px 10px;
    font-size: 12px;
  }

  .push-card {
    flex-direction: column;
  }

  .push-main {
    padding: 16px;
  }

  .push-actions {
    flex-direction: row;
    border-left: none;
    border-top: 1px solid #f5f5f5;
    padding: 12px 16px;
    gap: 8px;
  }

  .push-name {
    font-size: 15px;
  }

  .field-row {
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    min-width: auto;
  }

  .field-value.channels {
    flex-wrap: wrap;
  }

  .modal {
    width: 95%;
    max-width: 100%;
    margin: 16px;
  }

  .modal-header {
    padding: 12px 16px;
  }

  .modal-body {
    padding: 16px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    font-size: 13px;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    padding: 8px 12px;
    font-size: 13px;
  }

  .channels-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .channel-checkbox {
    padding: 6px 10px;
  }

  .form-actions {
    flex-direction: column;
    gap: 8px;
  }

  .form-actions .btn {
    width: 100%;
  }

  .datetime-inputs {
    flex-direction: column;
    gap: 8px;
  }

  .quick-schedule {
    flex-wrap: wrap;
  }

  .schedule-type-selector {
    flex-wrap: wrap;
  }

  .recurring-options {
    flex-wrap: wrap;
  }

  .recurring-btn {
    flex: 1 1 calc(50% - 4px);
    min-width: 0;
  }

  .weekday-options {
    gap: 6px;
  }

  .weekday-btn {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  .monthday-options {
    gap: 4px;
  }

  .monthday-btn {
    width: 28px;
    height: 28px;
    font-size: 11px;
  }

  .cron-help {
    padding: 8px 10px;
    font-size: 11px;
  }

  .cron-help code {
    font-size: 11px;
    min-width: 70px;
  }
}

@media (max-width: 480px) {
  .panel {
    padding: 12px;
  }

  .panel-header h2 {
    font-size: 14px;
  }

  .push-main {
    padding: 12px;
  }

  .push-name {
    font-size: 14px;
  }

  .field-row {
    font-size: 12px;
  }

  .action-btn {
    padding: 6px 12px;
    font-size: 12px;
  }

  .btn-small {
    padding: 5px 10px;
    font-size: 11px;
  }

  .filter-btn {
    padding: 4px 8px;
    font-size: 11px;
  }

  .filter-btn .count {
    font-size: 10px;
    padding: 1px 4px;
  }

  .modal-header h3 {
    font-size: 14px;
  }

  .channel-icon {
    font-size: 16px;
  }

  .channel-checkbox {
    padding: 5px 8px;
    font-size: 12px;
  }

  .status-badge {
    padding: 3px 8px;
    font-size: 11px;
  }
}
</style>
