// ============================================
// 工具函数：日期和时区处理
// ============================================

/**
 * 获取指定时区的本地时间（小时和分钟）
 */
export function getLocalTime(now: Date, timezone: string): { hour: number; minute: number } {
  const localHourStr = now.toLocaleString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const localMinuteStr = now.toLocaleString('en-US', {
    timeZone: timezone,
    minute: '2-digit',
  });
  return {
    hour: parseInt(localHourStr, 10),
    minute: parseInt(localMinuteStr, 10),
  };
}

/**
 * 获取星期几（1-7，周一到周日）
 */
export function getLocalWeekday(now: Date, timezone: string): number {
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const localDay = now.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  return dayMap[localDay] ?? 0;
}
