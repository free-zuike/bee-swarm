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
    if (offset === 8) return 'Asia/Shanghai';
    if (offset === 0) return 'UTC';
    if (offset === 9) return 'Asia/Tokyo';
    if (offset === -5) return 'America/New_York';
    if (offset === -8) return 'America/Los_Angeles';
    return 'UTC';
  }
  return tz;
}
