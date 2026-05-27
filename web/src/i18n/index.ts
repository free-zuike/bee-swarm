// 国际化类型定义
export type Locale = 'zh' | 'en';

export interface LocaleMessages {
  [key: string]: string;
}

// 当前语言
let currentLocale: Locale = 'zh';

// 获取当前语言
export function getLocale(): Locale {
  return currentLocale;
}

// 设置语言
export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem('bee_swarm_locale', locale);
}

// 初始化语言
export function initLocale(): void {
  const saved = localStorage.getItem('bee_swarm_locale') as Locale;
  if (saved && ['zh', 'en'].includes(saved)) {
    currentLocale = saved;
  } else {
    const browserLang = navigator.language.split('-')[0];
    currentLocale = browserLang === 'zh' ? 'zh' : 'en';
  }
}
