export const TIMEZONE_OFFSET_MAP: Readonly<Record<string, string>> = {
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
  '0': 'UTC',
  '1': 'Europe/Berlin',
  '2': 'Europe/Athens',
  '3': 'Europe/Moscow',
  '4': 'Asia/Dubai',
  '5': 'Asia/Karachi',
  '6': 'Asia/Dhaka',
  '7': 'Asia/Bangkok',
  '8': 'Asia/Shanghai',
  '9': 'Asia/Tokyo',
  '10': 'Australia/Sydney',
  '11': 'Pacific/Noumea',
  '12': 'Pacific/Auckland',
} as const;

export const FALLBACK_TIMEZONE = 'UTC';

export const SPECIAL_TIMEZONE_OVERRIDES: Readonly<Record<string, string>> = {
  '5.5': 'Asia/Kolkata',
  '+5.5': 'Asia/Kolkata',
} as const;

export function convertTimezone(tz: string): string {
  const special = SPECIAL_TIMEZONE_OVERRIDES[tz];
  if (special) return special;

  if (/^-?\d+$/.test(tz)) {
    return TIMEZONE_OFFSET_MAP[tz] ?? FALLBACK_TIMEZONE;
  }

  return tz;
}
