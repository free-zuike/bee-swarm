<template>
  <div class="scheduled-push-manager" :class="{ dark: isDark }">
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
                  <div style="display: flex; gap: 8px; align-items: center">
                    <span class="status-badge" :class="push.status" style="margin: 0">
                      {{ t(getStatusLabel(push.status)) }}
                    </span>
                    <span class="type-badge" :class="push.scheduleType || 'once'">
                      {{
                        push.scheduleType === 'recurring'
                          ? t('scheduled.scheduleType.recurring')
                          : t('scheduled.scheduleType.once')
                      }}
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
                <div class="field-row" v-if="push.scheduleType === 'recurring'">
                  <span class="field-label">{{ t('scheduled.label.upcomingExecutions') }}</span>
                  <button
                    class="toggle-upcoming-btn"
                    @click.stop="toggleExpanded(push.id)"
                  >
                    {{ expandedPushes.has(push.id) ? '▲' : '▼' }}
                  </button>
                </div>
                <div v-if="push.scheduleType === 'recurring' && expandedPushes.has(push.id)" class="upcoming-executions">
                  <template v-if="getUpcomingExecutions(push, 10).length > 0">
                    <div
                      v-for="(exec, idx) in getUpcomingExecutions(push, 10)"
                      :key="idx"
                      class="execution-item"
                    >
                      {{ idx + 1 }}. {{ formatDateTime(exec.toISOString()) }}
                    </div>
                  </template>
                  <div v-else class="execution-empty">
                    {{ push.recurringType === 'cron' ? '无法解析 Cron 表达式，请检查格式' : '暂无预计执行时间' }}
                  </div>
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
                class="action-btn action-edit"
                @click="openEditModal(push)"
              >
                {{ t('scheduled.button.edit') }}
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
                {{ t('scheduled.button.renew') }}
              </button>
              <button
                v-if="push.status === 'overdue'"
                class="action-btn action-reschedule"
                @click="openRescheduleModal(push)"
              >
                {{ t('scheduled.button.reschedule') }}
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
          <h3>{{ editingPush ? t('scheduled.edit') : t('scheduled.create') }}</h3>
          <button class="btn-close" @click="closeModal">&times;</button>
        </div>

        <form @submit.prevent="handleModalSubmit" class="modal-body">
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
                <button
                  type="button"
                  class="recurring-btn"
                  :class="{ active: recurringType === 'cron' }"
                  @click="recurringType = 'cron'"
                >
                  {{ t('scheduled.label.cron') }}
                </button>
              </div>

              <div v-if="recurringType !== 'hourly'" class="recurring-time">
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

              <div v-if="recurringType === 'monthly'" class="monthly-selector">
                <div class="monthly-date">
                  <label class="weekday-label"
                    >{{ t('scheduled.label.selectDate') }} <span class="required">*</span></label
                  >
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
                  <p class="selector-hint">{{ t('hint.monthly_days') }}</p>
                </div>
              </div>

              <div v-if="recurringType === 'yearly'" class="yearly-selector">
                <div class="yearly-dates-list">
                  <label class="weekday-label"
                    >{{ t('scheduled.label.selectYearlyDates') }} <span class="required">*</span></label
                  >
                  <div v-for="(date, index) in yearlyDates" :key="index" class="yearly-date-row">
                    <select
                      v-model="date.month"
                      class="month-select"
                      @change="handleMonthChange(index)"
                    >
                      <option v-for="month in months" :key="month.value" :value="month.value">
                        {{ t(month.label) }}
                      </option>
                    </select>
                    <span class="date-separator">/</span>
                    <select v-model="date.day" class="day-select">
                      <option v-for="day in getDaysInMonth(date.month)" :key="day" :value="day">
                        {{ day }}
                      </option>
                    </select>
                    <button
                      v-if="yearlyDates.length > 1"
                      type="button"
                      class="remove-date-btn"
                      @click="removeYearlyDate(index)"
                    >
                      ×
                    </button>
                  </div>
                  <button type="button" class="add-date-btn" @click="addYearlyDate">
                    + {{ t('scheduled.label.addDate') }}
                  </button>
                </div>
                <p class="selector-hint">{{ t('hint.yearly_dates') }}</p>
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
                  <div class="cron-examples">
                    <button
                      type="button"
                      class="cron-example-btn"
                      @click.stop="cronExpression = '*/5 * * * *'"
                    >
                      <span class="cron-example-label">{{ t('scheduled.label.every5Min') }}</span>
                      <code>*/5 * * * *</code>
                    </button>
                    <button
                      type="button"
                      class="cron-example-btn"
                      @click.stop="cronExpression = '0 */2 * * *'"
                    >
                      <span class="cron-example-label">{{ t('scheduled.label.every2Hour') }}</span>
                      <code>0 */2 * * *</code>
                    </button>
                    <button
                      type="button"
                      class="cron-example-btn"
                      @click.stop="cronExpression = '0 9 * * 1-5'"
                    >
                      <span class="cron-example-label">{{ t('scheduled.label.weekday9am') }}</span>
                      <code>0 9 * * 1-5</code>
                    </button>
                    <button
                      type="button"
                      class="cron-example-btn"
                      @click.stop="cronExpression = '0 0 1 * *'"
                    >
                      <span class="cron-example-label">{{ t('scheduled.label.month1st0am') }}</span>
                      <code>0 0 1 * *</code>
                    </button>
                    <button
                      type="button"
                      class="cron-example-btn"
                      @click.stop="cronExpression = '0 9,12,18 * * *'"
                    >
                      <span class="cron-example-label">{{ t('scheduled.label.daily91218') }}</span>
                      <code>0 9,12,18 * * *</code>
                    </button>
                  </div>
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
                {{ template.name }} ({{
                  (template.channels || []).map((ch) => getChannelName(ch)).join(', ')
                }})
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
      @click.self="
        showDeleteConfirm = false;
        actionTarget = null;
      "
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('scheduled.message.deleteConfirm') }}</h3>
          <button
            class="btn-close"
            @click="
              showDeleteConfirm = false;
              actionTarget = null;
            "
          >
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.confirm.deleteScheduled', { title: actionTarget?.title || '' }) }}</p>
          <div class="form-actions">
            <button
              class="btn btn-secondary"
              @click="
                showDeleteConfirm = false;
                actionTarget = null;
              "
            >
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
      @click.self="
        showCancelConfirm = false;
        actionTarget = null;
      "
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('scheduled.message.cancel') }}</h3>
          <button
            class="btn-close"
            @click="
              showCancelConfirm = false;
              actionTarget = null;
            "
          >
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.confirm.cancelScheduled', { title: actionTarget?.title || '' }) }}</p>
          <div class="form-actions">
            <button
              class="btn btn-secondary"
              @click="
                showCancelConfirm = false;
                actionTarget = null;
              "
            >
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
      @click.self="
        showTestConfirm = false;
        actionTarget = null;
      "
    >
      <div class="modal modal-small">
        <div class="modal-header">
          <h3>{{ t('scheduled.message.testConfirm') }}</h3>
          <button
            class="btn-close"
            @click="
              showTestConfirm = false;
              actionTarget = null;
            "
          >
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.confirm.testScheduled', { title: actionTarget?.title || '' }) }}</p>
          <div class="form-actions">
            <button
              class="btn btn-secondary"
              @click="
                showTestConfirm = false;
                actionTarget = null;
              "
            >
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-primary" @click="doTest" :disabled="testRunning">
              {{ testRunning ? t('scheduled.message.testing') : t('scheduled.message.executeNow') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showRescheduleModal"
      class="modal-overlay"
      @click.self="
        showRescheduleModal = false;
        reschedulePush = null;
      "
    >
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('scheduled.reschedule.title') }}</h3>
          <button
            class="btn-close"
            @click="
              showRescheduleModal = false;
              reschedulePush = null;
            "
          >
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p>{{ t('scheduled.reschedule.message', { title: reschedulePush?.title || '' }) }}</p>

          <div class="form-group">
            <label>{{ t('scheduled.label.executeTime') }}</label>
            <div class="datetime-inputs" style="margin-top: 12px">
              <input v-model="rescheduleDate" type="date" :min="today" required />
              <input v-model="rescheduleTime" type="time" required />
            </div>
            <div class="quick-schedule" style="margin-top: 12px">
              <button
                type="button"
                class="btn-quick"
                @click="
                  (() => {
                    const now = new Date();
                    now.setHours(now.getHours() + 1);
                    rescheduleDate = now.toISOString().split('T')[0];
                    rescheduleTime = now.toTimeString().slice(0, 5);
                  })()
                "
              >
                {{ t('label.1HourLater') }}
              </button>
              <button
                type="button"
                class="btn-quick"
                @click="
                  (() => {
                    const now = new Date();
                    now.setDate(now.getDate() + 1);
                    now.setHours(9, 0, 0, 0);
                    rescheduleDate = now.toISOString().split('T')[0];
                    rescheduleTime = '09:00';
                  })()
                "
              >
                {{ t('label.tomorrow9am') }}
              </button>
              <button
                type="button"
                class="btn-quick"
                @click="
                  (() => {
                    const now = new Date();
                    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
                    now.setDate(now.getDate() + daysUntilMonday);
                    now.setHours(9, 0, 0, 0);
                    rescheduleDate = now.toISOString().split('T')[0];
                    rescheduleTime = '09:00';
                  })()
                "
              >
                {{ t('label.nextMonday') }}
              </button>
            </div>
          </div>

          <div class="form-actions">
            <button
              class="btn btn-secondary"
              @click="
                showRescheduleModal = false;
                reschedulePush = null;
              "
            >
              {{ t('common.cancel') }}
            </button>
            <button class="btn btn-primary" @click="doReschedule" :disabled="rescheduling">
              {{
                rescheduling
                  ? t('scheduled.message.rescheduling')
                  : t('scheduled.message.reschedule')
              }}
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
import { useThemeStore } from '@/stores/theme';
import { useGlobalToast } from '@/composables/useToast';
import {
  getScheduledPushes,
  createScheduledPush,
  updateScheduledPush,
  cancelScheduledPush,
  deleteScheduledPush,
  getTemplates,
  rescheduleOverdueTask,
} from '@/api';

const t = useTranslation();
const { showToast } = useGlobalToast();
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);

interface ScheduledPush {
  id: string;
  title: string;
  content: string;
  scheduledAt: string;
  channels: string[];
  templateId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'overdue';
  createdBy?: string;
  scheduleType?: 'once' | 'recurring';
  recurringType?:
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'interval'
    | 'cron'
    | 'intervalMonth'
    | 'yearly'
    | 'intervalYear';
  selectedWeekDays?: number[];
  selectedMonthDays?: number[];
  yearlyDates?: Array<{ month: number; day: number }>;
  cronExpression?: string;
  overdueReminderSent?: boolean;
  overdueAt?: string;
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
const showRescheduleModal = ref(false);
const actionTarget = ref<ScheduledPush | null>(null);
const renewPush = ref<ScheduledPush | null>(null);
const editingPush = ref<ScheduledPush | null>(null);
const filterStatus = ref<string>('all');
const expandedPushes = ref<Set<string>>(new Set());
const rescheduling = ref(false);
const reschedulePush = ref<ScheduledPush | null>(null);
const today = new Date().toISOString().split('T')[0];
const rescheduleDate = ref(today);
const rescheduleTime = ref('09:00');

const scheduleType = ref<'once' | 'recurring'>('once');
const recurringType = ref<'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'cron'>('daily');
const selectedWeekDays = ref<number[]>([1, 2, 3, 4, 5]);
const selectedMonthDays = ref<number[]>([1, 15]);
const selectedMonths = ref<number[]>([1]);
const selectedYearDays = ref<number[]>([1]);
const cronExpression = ref('0 9 * * *');

const weekDays = [
  { value: 1, label: 'label.monday' },
  { value: 2, label: 'label.tuesday' },
  { value: 3, label: 'label.wednesday' },
  { value: 4, label: 'label.thursday' },
  { value: 5, label: 'label.friday' },
  { value: 6, label: 'label.saturday' },
  { value: 0, label: 'label.sunday' },
];

const months = [
  { value: 1, label: 'month.january' },
  { value: 2, label: 'month.february' },
  { value: 3, label: 'month.march' },
  { value: 4, label: 'month.april' },
  { value: 5, label: 'month.may' },
  { value: 6, label: 'month.june' },
  { value: 7, label: 'month.july' },
  { value: 8, label: 'month.august' },
  { value: 9, label: 'month.september' },
  { value: 10, label: 'month.october' },
  { value: 11, label: 'month.november' },
  { value: 12, label: 'month.december' },
];

const monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

// 每年任务的日期组合数组（用于"选择1月1日和4月5日"这样的场景）
const yearlyDates = ref<Array<{ month: number; day: number }>>([{ month: 1, day: 1 }]);

// 添加一个新的日期组合
const addYearlyDate = () => {
  yearlyDates.value.push({ month: 1, day: 1 });
};

// 移除指定索引的日期组合
const removeYearlyDate = (index: number) => {
  if (yearlyDates.value.length > 1) {
    yearlyDates.value.splice(index, 1);
  }
};

// 获取指定月份的天数（考虑平年和闰年）
const getDaysInMonth = (month: number, year?: number): number[] => {
  // 使用实际日期计算每月天数
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  // 如果指定了年份，检查是否为闰年
  if (year !== undefined) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (isLeapYear) {
      daysInMonth[1] = 29; // 闰年二月29天
    }
  } else {
    // 默认假设闰年（二月设为29天），这样即使选择2月29日在非闰年也能正常工作
    daysInMonth[1] = 29;
  }
  
  return Array.from({ length: daysInMonth[month - 1] }, (_, i) => i + 1);
};

// 当月份改变时，确保日期不超过该月的最大天数
const handleMonthChange = (index: number) => {
  const date = yearlyDates.value[index];
  const maxDay = getDaysInMonth(date.month).length;
  if (date.day > maxDay) {
    yearlyDates.value[index].day = maxDay;
  }
};

const statusFilters = [
  { value: 'all', label: 'scheduled.filter.all' },
  { value: 'pending', label: 'scheduled.filter.pending' },
  { value: 'running', label: 'scheduled.filter.running' },
  { value: 'completed', label: 'scheduled.filter.completed' },
  { value: 'failed', label: 'scheduled.filter.failed' },
  { value: 'overdue', label: 'scheduled.filter.overdue' },
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
    overdue: 'scheduled.filter.overdue',
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

function toggleMonth(month: number): void {
  const idx = selectedMonths.value.indexOf(month);
  if (idx === -1) {
    selectedMonths.value.push(month);
  } else {
    selectedMonths.value.splice(idx, 1);
  }
}

function toggleYearDay(day: number): void {
  const idx = selectedYearDays.value.indexOf(day);
  if (idx === -1) {
    selectedYearDays.value.push(day);
  } else {
    selectedYearDays.value.splice(idx, 1);
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
  cronExpression.value = '0 9 * * *';
  // 重置每年任务的日期组合
  yearlyDates.value = [{ month: 1, day: 1 }];
}

function openCreateModal(): void {
  resetForm();
  showModal.value = true;
}

function openRenewModal(push: ScheduledPush): void {
  renewPush.value = push;
  editingPush.value = null;
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
    recurringType.value = push.recurringType as
      | 'hourly'
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'yearly'
      | 'cron';
  }
  if (push.selectedWeekDays) {
    selectedWeekDays.value = [...push.selectedWeekDays];
  }
  if (push.selectedMonthDays) {
    selectedMonthDays.value = [...push.selectedMonthDays];
  }
  if (push.yearlyDates && push.yearlyDates.length > 0) {
    yearlyDates.value = [...push.yearlyDates];
  } else {
    yearlyDates.value = [{ month: 1, day: 1 }];
  }
  if (push.cronExpression) {
    cronExpression.value = push.cronExpression;
  }
  showModal.value = true;
}

function openEditModal(push: ScheduledPush): void {
  editingPush.value = push;
  renewPush.value = null;
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
    recurringType.value = push.recurringType as
      | 'hourly'
      | 'daily'
      | 'weekly'
      | 'monthly'
      | 'yearly'
      | 'cron';
  }
  if (push.selectedWeekDays) {
    selectedWeekDays.value = [...push.selectedWeekDays];
  }
  if (push.selectedMonthDays) {
    selectedMonthDays.value = [...push.selectedMonthDays];
  }
  if (push.yearlyDates && push.yearlyDates.length > 0) {
    yearlyDates.value = [...push.yearlyDates];
  } else {
    yearlyDates.value = [{ month: 1, day: 1 }];
  }
  if (push.cronExpression) {
    cronExpression.value = push.cronExpression;
  }
  // 解析 scheduledAt
  const scheduledDate = new Date(push.scheduledAt);
  newPush.value.date = scheduledDate.toISOString().split('T')[0];
  newPush.value.time = scheduledDate.toTimeString().slice(0, 5);
  showModal.value = true;
}

function closeModal(): void {
  showModal.value = false;
  renewPush.value = null;
  editingPush.value = null;
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

async function handleModalSubmit(): Promise<void> {
  if (editingPush.value) {
    await updateScheduledPushHandler();
  } else {
    await createScheduledPushHandler();
  }
}

async function updateScheduledPushHandler(): Promise<void> {
  if (!props.accessToken || !editingPush.value) {
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

  creating.value = true;
  try {
    await updateScheduledPush(props.accessToken, editingPush.value.id, {
      title: newPush.value.name,
      content: newPush.value.content,
      scheduledAt: scheduledTime.toISOString(),
      channels: newPush.value.channels,
      templateId: newPush.value.templateId || undefined,
      scheduleType: scheduleType.value,
      recurringType: scheduleType.value === 'recurring' ? recurringType.value : undefined,
      selectedWeekDays: recurringType.value === 'weekly' ? selectedWeekDays.value : undefined,
      selectedMonthDays: recurringType.value === 'monthly' ? selectedMonthDays.value : undefined,
      yearlyDates: recurringType.value === 'yearly' ? yearlyDates.value : undefined,
      cronExpression: recurringType.value === 'cron' ? cronExpression.value : undefined,
    });

    showModal.value = false;
    showToast(t('scheduled.message.updateSuccess'), 'success');
    await loadScheduledPushes();
  } catch (error) {
    console.error('Failed to update scheduled push:', error);
    showToast(t('scheduled.message.updateFailed'), 'error');
  } finally {
    creating.value = false;
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
    scheduledTime = calculateNextValidTime(scheduledTime);
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
      // 每年任务：使用 yearlyDates 数组（每个元素包含 month 和 day）
      yearlyDates: recurringType.value === 'yearly' ? yearlyDates.value : undefined,
      cronExpression: recurringType.value === 'cron' ? cronExpression.value : undefined,
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

/**
 * 计算下一个有效执行时间
 * 根据周期类型和选择的时间，自动计算应该开始执行的时间
 */
function calculateNextValidTime(scheduledTime: Date): Date {
  const now = new Date();

  // 防御性检查：确保变量已初始化
  if (!newPush.value || !newPush.value.time) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }

  const [hours, minutes] = newPush.value.time.split(':').map(Number);
  const selectedTime = new Date(scheduledTime);
  selectedTime.setHours(hours, minutes, 0, 0);

  // 如果选择的时间还没到，直接返回
  if (selectedTime > now) {
    return selectedTime;
  }

  // 如果已到或已过，根据周期类型计算下一个有效时间
  switch (recurringType.value) {
    case 'daily': {
      // 每天执行，明天同一时间
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }

    case 'weekly': {
      // 每周执行，找下一个工作日
      const weekdays =
        selectedWeekDays.value && selectedWeekDays.value.length > 0
          ? selectedWeekDays.value
          : [1, 2, 3, 4, 5];
      const todayDay = now.getDay();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const scheduledHour = hours;
      const scheduledMinute = minutes;

      // 检查今天是否在选择的工作日内
      const isTodayWorkday = weekdays.includes(todayDay);
      const isTodayBeforeScheduledTime =
        todayDay === 0
          ? false // 周日不是工作日
          : todayDay === 6
            ? false // 周六不是工作日
            : currentHour < scheduledHour ||
              (currentHour === scheduledHour && currentMinute < scheduledMinute);

      // 如果今天是工作日且还没到指定时间，就用今天
      if (isTodayWorkday && isTodayBeforeScheduledTime) {
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);
        return next;
      }

      // 否则找下一个工作日
      for (let i = 1; i <= 7; i++) {
        const checkDay = (todayDay + i) % 7;
        if (weekdays.includes(checkDay) && checkDay !== 0 && checkDay !== 6) {
          const next = new Date(now);
          next.setDate(next.getDate() + i);
          next.setHours(hours, minutes, 0, 0);
          return next;
        }
      }

      // 如果没找到，默认加7天
      const next = new Date(now);
      next.setDate(next.getDate() + 7);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }

    case 'monthly': {
      // 每月执行，找下一个有效日期
      const monthDays =
        selectedMonthDays.value && selectedMonthDays.value.length > 0
          ? selectedMonthDays.value
          : [1];
      const nowDay = now.getDate();
      const nowMonth = now.getMonth();
      const nowYear = now.getFullYear();

      // 检查本月剩余天数中是否有符合条件的
      for (const day of monthDays) {
        if (day > nowDay) {
          // 检查这个日期是否有效（不超过本月天数）
          const lastDayOfMonth = new Date(nowYear, nowMonth + 1, 0).getDate();
          if (day <= lastDayOfMonth) {
            const next = new Date(nowYear, nowMonth, day, hours, minutes, 0, 0);
            if (next > now) {
              return next;
            }
          }
        }
      }

      // 否则找下个月
      const nextMonth = nowMonth + 1 > 11 ? 0 : nowMonth + 1;
      const nextYear = nowMonth + 1 > 11 ? nowYear + 1 : nowYear;
      const firstDay = Math.min(monthDays[0], new Date(nextYear, nextMonth + 1, 0).getDate());
      const next = new Date(nextYear, nextMonth, firstDay, hours, minutes, 0, 0);
      return next;
    }

    case 'hourly': {
      // 每小时执行，下一个小时
      const next = new Date(now);
      next.setHours(next.getHours() + 1);
      next.setMinutes(minutes, 0, 0);
      return next;
    }

    case 'yearly': {
      // 每年执行，明年同日期
      const next = new Date(now);
      next.setFullYear(next.getFullYear() + 1);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }

    default: {
      // 默认明天同一时间
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(hours, minutes, 0, 0);
      return next;
    }
  }
}

// 计算接下来 N 次的执行时间
function getUpcomingExecutions(push: ScheduledPush, count: number = 10): Date[] {
  const executions: Date[] = [];
  const now = new Date();
  const scheduledAt = new Date(push.scheduledAt);
  const hours = scheduledAt.getHours();
  const minutes = scheduledAt.getMinutes();

  let current = new Date(now);

  switch (push.recurringType) {
    case 'hourly': {
      current.setMinutes(minutes, 0, 0);
      if (current <= now) {
        current.setHours(current.getHours() + 1);
      }
      for (let i = 0; i < count; i++) {
        executions.push(new Date(current));
        current.setHours(current.getHours() + 1);
      }
      break;
    }

    case 'daily': {
      current.setHours(hours, minutes, 0, 0);
      if (current <= now) {
        current.setDate(current.getDate() + 1);
      }
      for (let i = 0; i < count; i++) {
        executions.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      break;
    }

    case 'weekly': {
      const weekdays = push.selectedWeekDays && push.selectedWeekDays.length > 0
        ? push.selectedWeekDays
        : [0, 1, 2, 3, 4, 5, 6];
      current.setHours(hours, minutes, 0, 0);
      if (current <= now) {
        current.setDate(current.getDate() + 1);
        current.setHours(hours, minutes, 0, 0);
      }
      const maxDays = count * 7 + 7;
      for (let i = 0; i < maxDays && executions.length < count; i++) {
        const dayOfWeek = current.getDay();
        if (weekdays.includes(dayOfWeek)) {
          executions.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
      break;
    }

    case 'monthly': {
      const monthDays = push.selectedMonthDays && push.selectedMonthDays.length > 0
        ? push.selectedMonthDays
        : [1];
      current.setHours(hours, minutes, 0, 0);
      if (current <= now) {
        current.setDate(current.getDate() + 1);
        current.setHours(hours, minutes, 0, 0);
      }
      const maxMonths = count * 2;
      for (let m = 0; m < maxMonths && executions.length < count; m++) {
        const year = current.getFullYear();
        const month = current.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();

        for (const day of monthDays) {
          if (day > lastDay) continue; // 跳过当月不存在的日期（如2月没有31号）
          const candidate = new Date(year, month, day, hours, minutes, 0, 0);
          if (candidate > now && !executions.some(e => e.getTime() === candidate.getTime())) {
            executions.push(candidate);
            if (executions.length >= count) break;
          }
        }
        // 跳到下个月1号
        current = new Date(year, month + 1, 1, hours, minutes, 0, 0);
      }
      break;
    }

    case 'yearly': {
      const yearlyDates = push.yearlyDates && push.yearlyDates.length > 0
        ? push.yearlyDates
        : [{ month: 1, day: 1 }];
      current.setHours(hours, minutes, 0, 0);
      const startYear = current.getFullYear();
      const maxYears = count + 2;
      for (let y = 0; y < maxYears && executions.length < count; y++) {
        const year = startYear + y;
        for (const date of yearlyDates) {
          // 检查该日期是否有效（如2月29日在非闰年不存在）
          const lastDay = new Date(year, date.month, 0).getDate();
          if (date.day > lastDay) continue;
          const candidate = new Date(year, date.month - 1, date.day, hours, minutes, 0, 0);
          if (candidate > now && !executions.some(e => e.getTime() === candidate.getTime())) {
            executions.push(candidate);
            if (executions.length >= count) break;
          }
        }
      }
      break;
    }

    case 'cron': {
      if (push.cronExpression) {
        const nextDates = getNextCronExecutions(push.cronExpression, count, scheduledAt);
        executions.push(...nextDates);
      }
      break;
    }

    default: {
      // 如果 recurringType 为空但 scheduleType 是 recurring，默认为 daily
      if (push.scheduleType === 'recurring') {
        const effectiveType = push.recurringType || 'daily';
        const tempPush = { ...push, recurringType: effectiveType };
        return getUpcomingExecutions(tempPush, count);
      }
      // 默认返回单次执行时间
      if (push.scheduledAt) {
        executions.push(new Date(push.scheduledAt));
      }
      break;
    }
  }

  return executions.slice(0, count);
}

// 解析 cron 表达式获取接下来 N 次执行时间（简化版，支持标准 cron 格式）
function getNextCronExecutions(cronExpression: string, count: number, _baseDate: Date): Date[] {
  const executions: Date[] = [];
  const now = new Date();

  if (!cronExpression || !cronExpression.trim()) {
    return executions;
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return executions;
  }

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  // 解析单个 cron 字段：支持 *  固定值  范围 a-b  列表 a,b,c  步长 */n  a-b/n
  const parseCronField = (field: string, minVal: number, maxVal: number): number[] => {
    const values: Set<number> = new Set();

    // 处理逗号分隔的多值
    const segments = field.split(',');
    for (const segment of segments) {
      // 处理步长语法
      let [rangePart, stepPart] = segment.split('/');
      let step = stepPart ? parseInt(stepPart, 10) : 1;

      if (isNaN(step) || step < 1) step = 1;

      // 处理范围
      if (rangePart === '*') {
        for (let i = minVal; i <= maxVal; i += step) {
          values.add(i);
        }
      } else if (rangePart.includes('-')) {
        const [start, end] = rangePart.split('-').map(v => parseInt(v, 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i += step) {
            if (i >= minVal && i <= maxVal) values.add(i);
          }
        }
      } else {
        // 单个值
        const val = parseInt(rangePart, 10);
        if (!isNaN(val)) {
          if (val >= minVal && val <= maxVal) {
            // 如果有步长，从这个值开始递增
            if (stepPart) {
              for (let i = val; i <= maxVal; i += step) {
                values.add(i);
              }
            } else {
              values.add(val);
            }
          }
        }
      }
    }

    return Array.from(values).sort((a, b) => a - b);
  };

  // 解析各字段
  const validMinutes = parseCronField(minuteStr, 0, 59);
  const validHours = parseCronField(hourStr, 0, 23);
  const validDaysOfMonth = dayOfMonthStr === '*' ? null : parseCronField(dayOfMonthStr, 1, 31);
  const validMonths = monthStr === '*' ? null : parseCronField(monthStr, 1, 12);
  const validDaysOfWeek = dayOfWeekStr === '*' ? null : parseCronField(dayOfWeekStr, 0, 6);

  if (validMinutes.length === 0 || validHours.length === 0) {
    return executions;
  }

  // 从当前时间的下一分钟开始搜索
  let current = new Date(now);
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  const maxIterations = 525600; // 最多搜索一年（365*24*60）
  let iterations = 0;

  while (executions.length < count && iterations < maxIterations) {
    iterations++;

    const minuteMatches = validMinutes.includes(current.getMinutes());
    const hourMatches = validHours.includes(current.getHours());
    const dayMatches = !validDaysOfMonth || validDaysOfMonth.includes(current.getDate());
    const monthMatches = !validMonths || validMonths.includes(current.getMonth() + 1);
    const weekdayMatches = !validDaysOfWeek || validDaysOfWeek.includes(current.getDay());

    if (minuteMatches && hourMatches && dayMatches && monthMatches && weekdayMatches) {
      executions.push(new Date(current));
      // 找到后至少推进1分钟，避免重复
      current = new Date(current.getTime() + 60000);
      continue;
    }

    // 智能跳转，避免每分钟遍历
    // 如果分钟不匹配，跳到下一个有效分钟
    if (!minuteMatches) {
      const currentMin = current.getMinutes();
      const nextMinute = validMinutes.find(m => m > currentMin);
      if (nextMinute !== undefined) {
        current.setMinutes(nextMinute);
      } else {
        // 跳到下一小时的第一个有效分钟
        current.setHours(current.getHours() + 1);
        current.setMinutes(validMinutes[0]);
      }
      current.setSeconds(0, 0);
      continue;
    }

    // 如果小时不匹配，跳到下一个有效小时
    if (!hourMatches) {
      const currentHour = current.getHours();
      const nextHour = validHours.find(h => h > currentHour);
      if (nextHour !== undefined) {
        current.setHours(nextHour);
      } else {
        // 跳到第二天的第一个有效小时
        current.setDate(current.getDate() + 1);
        current.setHours(validHours[0]);
      }
      current.setMinutes(validMinutes[0]);
      current.setSeconds(0, 0);
      continue;
    }

    // 如果日期/月份/星期不匹配，跳到下一天
    if (!dayMatches || !monthMatches || !weekdayMatches) {
      current.setDate(current.getDate() + 1);
      current.setHours(validHours[0]);
      current.setMinutes(validMinutes[0]);
      current.setSeconds(0, 0);
      continue;
    }
  }

  return executions;
}

function toggleExpanded(pushId: string): void {
  if (expandedPushes.value.has(pushId)) {
    expandedPushes.value.delete(pushId);
  } else {
    expandedPushes.value.add(pushId);
  }
  // 触发响应式更新
  expandedPushes.value = new Set(expandedPushes.value);
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

function openRescheduleModal(push: ScheduledPush): void {
  reschedulePush.value = push;
  // 初始化时间为明天 9 点
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  rescheduleDate.value = tomorrow.toISOString().split('T')[0];
  rescheduleTime.value = '09:00';
  showRescheduleModal.value = true;
}

async function doReschedule(): Promise<void> {
  if (!props.accessToken || !reschedulePush.value) return;

  const scheduledTime = new Date(`${rescheduleDate.value}T${rescheduleTime.value}`);

  if (scheduledTime <= new Date()) {
    showToast(t('message.timeMustBeFuture'), 'error');
    return;
  }

  rescheduling.value = true;
  try {
    await rescheduleOverdueTask(
      props.accessToken,
      reschedulePush.value.id,
      scheduledTime.toISOString()
    );
    showRescheduleModal.value = false;
    showToast(t('scheduled.message.rescheduleSuccess'), 'success');
    await loadScheduledPushes();
  } catch (error) {
    console.error('Failed to reschedule push:', error);
    showToast(t('scheduled.message.rescheduleFailed'), 'error');
  } finally {
    rescheduling.value = false;
    reschedulePush.value = null;
  }
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

.status-badge.overdue {
  background: #ff787520;
  color: #ff7875;
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

.toggle-upcoming-btn {
  background: var(--bg-panel, white);
  border: 1px solid var(--border-color, #d9d9d9);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 10px;
  margin-left: 8px;
  color: var(--text-primary, #333);
}

.toggle-upcoming-btn:hover {
  background: var(--bg-secondary, #f5f5f5);
}

.upcoming-executions {
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
}

.execution-item {
  padding: 4px 0;
  font-size: 13px;
  color: var(--text-primary, #333);
}

.execution-item:nth-child(odd) {
  background: rgba(0, 0, 0, 0.02);
}

@media (prefers-color-scheme: dark) {
  .execution-item:nth-child(odd) {
    background: rgba(255, 255, 255, 0.04);
  }
}

.execution-empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-secondary, #999);
  text-align: center;
  font-style: italic;
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

.action-edit {
  background: #faad14;
  color: white;
}

.action-edit:hover {
  background: #d99612;
}

.action-renew {
  background: #13c2c2;
  color: white;
}

.action-renew:hover {
  background: #0fa3a3;
}

.action-reschedule {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.action-reschedule:hover {
  opacity: 0.9;
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

.month-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.month-btn {
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

.month-btn:hover {
  border-color: #667eea;
}

.month-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.monthday-selector {
  margin-top: 12px;
}

.selector-hint {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  margin-bottom: 0;
  line-height: 1.5;
}

.required {
  color: #ff4d4f;
  margin-left: 4px;
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

.yearly-selector {
  margin-top: 12px;
}

.yearly-dates-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.yearly-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-select,
.day-select {
  padding: 8px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: var(--bg-panel, white);
  color: var(--text-primary, #333);
  cursor: pointer;
  transition: border-color 0.2s;
}

.month-select:focus,
.day-select:focus {
  outline: none;
  border-color: #667eea;
}

.date-separator {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary, #666);
}

.remove-date-btn {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border-color, #e0e0e0);
  background: var(--bg-panel, white);
  border-radius: 50%;
  font-size: 18px;
  font-weight: 600;
  color: #ff4d4f;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
  padding: 0;
}

.remove-date-btn:hover {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}

.add-date-btn {
  padding: 8px 16px;
  border: 2px dashed var(--border-color, #e0e0e0);
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #667eea;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}

.add-date-btn:hover {
  border-color: #667eea;
  background: #667eea10;
}

/* 深色主题适配 */
.scheduled-push-manager.dark .month-select,
.scheduled-push-manager.dark .day-select {
  border-color: var(--border-color, #404040);
  background: var(--bg-panel, #1f1f1f);
  color: var(--text-primary, #e0e0e0);
}

.scheduled-push-manager.dark .remove-date-btn {
  border-color: var(--border-color, #404040);
  background: var(--bg-panel, #1f1f1f);
}

.scheduled-push-manager.dark .add-date-btn {
  border-color: var(--border-color, #404040);
  color: #667eea;
}

.scheduled-push-manager.dark .add-date-btn:hover {
  border-color: #667eea;
  background: #667eea20;
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

.cron-examples {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cron-example-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  background: var(--bg-panel, white);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary, #333);
  transition: all 0.2s;
  text-align: left;
}

.cron-example-btn:hover {
  background: var(--bg-secondary, #f0f0f0);
  border-color: #667eea;
}

.cron-example-label {
  color: var(--text-secondary, #666);
}

.cron-example-btn code {
  background: var(--bg-secondary, #f5f5f5);
  color: #667eea;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  min-width: auto;
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

  .cron-example-btn {
    padding: 5px 8px;
    font-size: 11px;
  }

  .cron-example-btn code {
    font-size: 10px;
    padding: 1px 6px;
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

/* 深色主题样式 */
.scheduled-push-manager.dark .panel {
  background: #1e1e2e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.scheduled-push-manager.dark .panel-header {
  border-bottom-color: #313244;
}

.scheduled-push-manager.dark .panel h2 {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .loading-state,
.scheduled-push-manager.dark .empty-state {
  color: #a6adc8;
}

.scheduled-push-manager.dark .filter-btn {
  border-color: #45475a;
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .filter-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.scheduled-push-manager.dark .filter-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.scheduled-push-manager.dark .push-card {
  background: #181825;
  border-color: #313244;
}

.scheduled-push-manager.dark .push-card:hover {
  border-color: #45475a;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.scheduled-push-manager.dark .push-name {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .field-label {
  color: #6c7086;
}

.scheduled-push-manager.dark .field-value {
  color: #bac2de;
}

.scheduled-push-manager.dark .push-actions {
  border-left-color: #313244;
  background: #1e1e2e;
}

.scheduled-push-manager.dark .modal {
  background: #1e1e2e;
}

.scheduled-push-manager.dark .modal-header {
  border-bottom-color: #313244;
}

.scheduled-push-manager.dark .modal-header h3 {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .btn-close {
  color: #a6adc8;
}

.scheduled-push-manager.dark .btn-close:hover {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .form-group label {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .form-group input,
.scheduled-push-manager.dark .form-group textarea,
.scheduled-push-manager.dark .form-group select {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.scheduled-push-manager.dark .form-group input:focus,
.scheduled-push-manager.dark .form-group textarea:focus,
.scheduled-push-manager.dark .form-group select:focus {
  border-color: #667eea;
}

.scheduled-push-manager.dark .btn-quick {
  background: #313244;
  border-color: #45475a;
  color: #cdd6f4;
}

.scheduled-push-manager.dark .btn-quick:hover {
  border-color: #667eea;
}

.scheduled-push-manager.dark .schedule-type-btn {
  border-color: #45475a;
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .schedule-type-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
  color: #667eea;
}

.scheduled-push-manager.dark .recurring-btn {
  border-color: #45475a;
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .recurring-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
  color: #667eea;
}

.scheduled-push-manager.dark .interval-label {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .interval-number {
  border-color: #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
}

.scheduled-push-manager.dark .interval-number:focus {
  border-color: #667eea;
}

.scheduled-push-manager.dark .recurring-time-label {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .weekday-label {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .weekday-btn {
  border-color: #45475a;
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .weekday-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.scheduled-push-manager.dark .month-btn {
  border-color: #45475a;
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .month-btn:hover {
  border-color: #667eea;
}

.scheduled-push-manager.dark .month-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.scheduled-push-manager.dark .selector-hint {
  color: #6c7086;
}

.scheduled-push-manager.dark .monthday-btn {
  border-color: #45475a;
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .monthday-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.scheduled-push-manager.dark .channel-checkbox {
  border-color: #45475a;
  background: #181825;
  color: #cdd6f4;
}

.scheduled-push-manager.dark .channel-checkbox:hover {
  border-color: #667eea;
}

.scheduled-push-manager.dark .btn-secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.scheduled-push-manager.dark .btn-secondary:hover {
  border-color: #667eea;
}

.scheduled-push-manager.dark .form-actions {
  border-top-color: #313244;
}

.scheduled-push-manager.dark .cron-label {
  color: #cdd6f4;
}

.scheduled-push-manager.dark .cron-input-field {
  border-color: #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
}

.scheduled-push-manager.dark .cron-input-field:focus {
  border-color: #667eea;
}

.scheduled-push-manager.dark .cron-help {
  background: #181825;
  color: #a6adc8;
}

.scheduled-push-manager.dark .cron-help code {
  background: #1e1e2e;
}

.scheduled-push-manager.dark .cron-example-btn {
  background: #1e1e2e;
  border-color: #313244;
  color: #cdd6f4;
}

.scheduled-push-manager.dark .cron-example-btn:hover {
  background: #313244;
  border-color: #667eea;
}

.scheduled-push-manager.dark .cron-example-label {
  color: #a6adc8;
}

.scheduled-push-manager.dark .cron-example-btn code {
  background: #181825;
  color: #89b4fa;
}

@media (max-width: 768px) {
  .scheduled-push-manager.dark .push-actions {
    border-top-color: #313244;
  }
}
</style>
