import { describe, it, expect } from 'vitest';
import { calculateNextScheduledAt } from '../../src/index';
import type { ScheduledPush } from '../../src/services/push';

function weekdays(iso: string, tz = 'Asia/Shanghai'): string[] {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' });
  return [iso].map((t) => f.format(new Date(t)));
}

function makePush(overrides: Partial<ScheduledPush>): ScheduledPush {
  return {
    id: 'test',
    templateId: undefined,
    title: '测试',
    content: '',
    channels: ['wework'],
    url: undefined,
    scheduledAt: new Date().toISOString(),
    scheduleType: 'recurring',
    recurringType: 'weekly',
    timezone: 'Asia/Shanghai',
    ...overrides,
  } as ScheduledPush;
}

describe('calculateNextScheduledAt - weekly', () => {
  it('周二周三 07:00 任务不应落到周四（回归：原逻辑跨天错位）', () => {
    // 现在：本地周三 09:00（UTC 周三 01:00），今天的 07:00 已过
    const now = new Date('2026-08-12T01:00:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-11T23:00:00.000Z', selectedWeekDays: [2, 3] }),
      now,
      'Asia/Shanghai'
    );
    // 2026-08-12 是周三，07:00 已过，应返回下周二（2026-08-18 07:00 本地 = 08-17T23:00Z）
    expect(next).toBe('2026-08-17T23:00:00.000Z');
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Tuesday');
  });

  it('周一设置周二 07:00 应正确落在下个周二', () => {
    const now = new Date('2026-08-10T01:00:00.000Z'); // 本地周一 09:00
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-09T23:00:00.000Z', selectedWeekDays: [2, 3] }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-08-10T23:00:00.000Z'); // 周二 07:00 本地
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Tuesday');
  });

  it('周四选中周五 09:00 应落到周五', () => {
    const now = new Date('2026-08-12T23:30:00.000Z'); // 本地周四 07:30
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-13T01:00:00.000Z', selectedWeekDays: [1, 5] }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-08-14T01:00:00.000Z'); // 周五 09:00 本地
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Friday');
  });

  it('周六选中周日均覆盖周六日', () => {
    const now = new Date('2026-08-15T02:00:00.000Z'); // 本地周六 10:00，当日 08:30 已过
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-15T00:30:00.000Z', selectedWeekDays: [0, 6] }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-08-16T00:30:00.000Z'); // 周日 08:30 本地
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Sunday');
  });

  // === 北京时区 19:00 以上时刻的归一化验证 ===
  it('北京时区 23:30 任务（跨天归一化验证）', () => {
    // 周二凌晨 00:05 本地，任务周三 23:30 → 今天周三 23:30 还没到
    const now = new Date('2026-08-11T16:05:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-11T15:30:00.000Z', selectedWeekDays: [2, 3] }),
      now,
      'Asia/Shanghai'
    );
    // 本地 8/12 周三 00:05，任务 23:30 未到 → 今天 23:30 = UTC 15:30
    expect(next).toBe('2026-08-12T15:30:00.000Z');
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Wednesday');
  });

  it('北京时区 20:00 周日任务（跨天归一化验证）', () => {
    const now = new Date('2026-08-12T12:05:00.000Z'); // 周三 20:05 本地
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-12T12:00:00.000Z', selectedWeekDays: [0] }),
      now,
      'Asia/Shanghai'
    );
    // 应找下周日 20:00 = UTC 12:00
    expect(next).toBe('2026-08-16T12:00:00.000Z');
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Sunday');
  });

  it('北京时区 19:01 场景（用户实际遇到的每周2,3任务时间）', () => {
    // 周三 19:01 执行后，计算下次 → 应下周二 19:01（周三已过）
    const now = new Date('2026-08-12T11:02:00.000Z'); // 周三 19:02 本地
    const next = calculateNextScheduledAt(
      makePush({ scheduledAt: '2026-08-12T11:01:00.000Z', selectedWeekDays: [2, 3] }),
      now,
      'Asia/Shanghai'
    );
    // 下周二 19:01 = UTC 11:01，8月18日周二
    expect(next).toBe('2026-08-18T11:01:00.000Z');
    expect(weekdays(next, 'Asia/Shanghai')[0]).toBe('Tuesday');
  });
});

describe('calculateNextScheduledAt - daily/hourly', () => {
  it('daily 基于 baseTime + 1 天', () => {
    const now = new Date('2026-08-12T01:00:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({ recurringType: 'daily', scheduledAt: '2026-08-11T00:00:00.000Z' }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-08-13T00:00:00.000Z'); // 08-12T00:00Z 已 <= now，继续推一天
  });
});

describe('calculateNextScheduledAt - cron', () => {
  it('cron 表达式按用户时区计算（原实现按 UTC，导致永不执行/错位）', () => {
    // 本地 2026-08-12 12:00（UTC 04:00），cron "0 9 * * *" 期望下一个本地 09:00 = UTC 01:00
    const now = new Date('2026-08-12T04:00:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({ recurringType: 'cron', cronExpression: '0 9 * * *', scheduledAt: '2026-08-11T00:00:00.000Z' }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-08-13T01:00:00.000Z'); // 本地 08-13 09:00
  });

  it('cron 当月内已过则顺延到下月', () => {
    const now = new Date('2026-08-20T10:00:00.000Z'); // 本地 08-20 18:00
    const next = calculateNextScheduledAt(
      makePush({ recurringType: 'cron', cronExpression: '0 9 1 * *', scheduledAt: '2026-07-01T00:00:00.000Z' }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-09-01T01:00:00.000Z'); // 本地 09-01 09:00
  });
});

describe('calculateNextScheduledAt - interval', () => {
  it('interval 首次执行不延迟一个完整间隔（原实现 hoursSinceStart 要求 >0 且整倍数）', () => {
    // 本地 08-13 09:00 开始（UTC 01:00），2 小时间隔
    const now = new Date('2026-08-13T01:05:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({ recurringType: 'interval', intervalHours: 2, scheduledAt: '2026-08-13T01:00:00.000Z' }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-08-13T03:00:00.000Z'); // +2h
  });
});

describe('calculateNextScheduledAt - monthly', () => {
  it('每月31日 23:30 北京时区（跨天归一化+月末clamp验证）', () => {
    // 8/31 23:31 执行完，下次 → 9/30 23:30（9月无31 clamp到30）
    const now = new Date('2026-08-31T15:31:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({ recurringType: 'monthly', selectedMonthDays: [31], scheduledAt: '2026-08-31T15:30:00.000Z' }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-09-30T15:30:00.000Z');
  });

  it('每月15日 10:00 北京时区正常', () => {
    const now = new Date('2026-08-15T02:05:00.000Z'); // 8/15 10:05 已过
    const next = calculateNextScheduledAt(
      makePush({ recurringType: 'monthly', selectedMonthDays: [15], scheduledAt: '2026-08-15T02:00:00.000Z' }),
      now,
      'Asia/Shanghai'
    );
    expect(next).toBe('2026-09-15T02:00:00.000Z');
  });
});

describe('calculateNextScheduledAt - yearly', () => {
  it('本地已经跨年但 UTC 未跨年时，按本地年份计算', () => {
    // 任务：每年 1月1日 00:00 本地执行（scheduledAt 本地时分 00:00 = UTC 前一天 16:00）
    // 现在：本地 2027-01-01 06:00 = UTC 2026-12-31 22:00，UTC 尚未跨年
    const now = new Date('2026-12-31T22:00:00.000Z');
    const next = calculateNextScheduledAt(
      makePush({
        recurringType: 'yearly',
        yearlyDates: [{ month: 1, day: 1 }],
        scheduledAt: '2025-01-01T16:00:00.000Z',
      }),
      now,
      'Asia/Shanghai'
    );
    // 2027-01-01 00:00 本地已过，应跳到 2028-01-01 00:00 本地 = UTC 2027-12-31T16:00
    expect(next).toBe('2027-12-31T16:00:00.000Z');
  });
});