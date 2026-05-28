export const SENSITIVE_FIELDS = [
  'secretAccessKey',
  'accessKeyId',
  'password',
  'secret',
  'token',
  'apiKey',
  'privateKey',
] as const;

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

export function filterSensitiveConfig<T extends Record<string, unknown>>(config: T): T {
  const filtered = { ...config };

  for (const field of SENSITIVE_FIELDS) {
    if (field in filtered) {
      delete (filtered as Record<string, unknown>)[field];
    }
  }

  return filtered as T;
}

export function hasSensitiveFields(config: Record<string, unknown>): boolean {
  return SENSITIVE_FIELDS.some((field) => field in config);
}
