// ============================================
// 工具函数：日期和时区处理
// ============================================

/**
 * 获取指定时区的本地时间（小时和分钟）
 */
export function getLocalTime(now: Date, timezone: string): { hour: number; minute: number } {
  // 更可靠的方法：使用 Intl.DateTimeFormat 并提取小时和分钟
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  let hour = 0;
  let minute = 0;

  for (const part of parts) {
    if (part.type === 'hour') {
      hour = parseInt(part.value, 10);
    } else if (part.type === 'minute') {
      minute = parseInt(part.value, 10);
    }
  }

  return { hour, minute };
}

/**
 * 获取星期几（0-6，周日到周六）
 */
export function getLocalWeekday(now: Date, timezone: string): number {
  // 使用 en-US locale 的 weekday: 'long' 获取完整星期名，避免缩写变化
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  });

  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  const localDay = formatter.format(now);
  return dayMap[localDay] ?? 0;
}
