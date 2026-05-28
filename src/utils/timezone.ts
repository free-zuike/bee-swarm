/**
 * 将数字时区偏移转换为 IANA 时区标识符
 * 兼容旧数据格式（如 "8"、"-5" 等纯数字）
 *
 * @param tz - 时区字符串（IANA 标识符或数字偏移）
 * @returns IANA 时区标识符
 */
export function convertTimezone(tz: string): string {
  if (/^-?\d+$/.test(tz)) {
    const offset = parseInt(tz, 10);
    const mapping: Record<number, string> = {
      '-12': 'Pacific/Kwajalein',
      '-11': 'Pacific/Midway',
      '-10': 'Pacific/Honolulu',
      '-9': 'America/Anchorage',
      '-8': 'America/Los_Angeles',
      '-7': 'America/Denver',
      '-6': 'America/Chicago',
      '-5': 'America/New_York',
      '-4': 'America/Halifax',
      '-3': 'America/Sao_Paulo',
      '-2': 'America/Noronha',
      '-1': 'Atlantic/Azores',
      0: 'UTC',
      1: 'Europe/Berlin',
      2: 'Europe/Athens',
      3: 'Europe/Moscow',
      4: 'Asia/Dubai',
      5: 'Asia/Karachi',
      6: 'Asia/Dhaka',
      7: 'Asia/Bangkok',
      8: 'Asia/Shanghai',
      9: 'Asia/Tokyo',
      10: 'Australia/Sydney',
      11: 'Pacific/Noumea',
      12: 'Pacific/Auckland',
    };
    return mapping[offset] ?? 'UTC';
  }
  if (tz === '5.5' || tz === '+5.5') return 'Asia/Kolkata';
  return tz;
}
