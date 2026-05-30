// ============================================
// 工具函数：Cron 表达式处理
// ============================================

/**
 * 匹配 cron 单个字段是否包含指定值
 */
export function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true;

  const values = field.split(',');
  for (const v of values) {
    if (v.includes('/')) {
      const [base, step] = v.split('/');
      const start = base === '*' ? 0 : parseInt(base, 10);
      const interval = parseInt(step, 10);
      if ((value - start) % interval === 0 && value >= start) return true;
      continue;
    }
    if (v.includes('-')) {
      const [start, end] = v.split('-').map(Number);
      if (value >= start && value <= end) return true;
      continue;
    }
    if (parseInt(v, 10) === value) return true;
  }
  return false;
}
