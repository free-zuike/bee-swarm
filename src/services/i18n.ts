export type Language = 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

export interface TranslatedContent {
  title: string;
  body?: string;
  url?: string;
  language: Language;
}

const LANGUAGE_NAMES: Record<Language, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export function getLanguageName(lang: Language): string {
  return LANGUAGE_NAMES[lang];
}

export function getSupportedLanguages(): Array<{ code: Language; name: string }> {
  return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
    code: code as Language,
    name,
  }));
}

export function translateText(
  text: string,
  targetLang: Language,
  customTranslations?: Record<string, Partial<Record<Language, string>>>
): string {
  if (targetLang === 'zh') return text;

  const translations: Record<string, Partial<Record<Language, string>>> = {
    'Bee Swarm Notification': {
      zh: '蜂群通知',
      en: 'Bee Swarm Notification',
      ja: 'Bee Swarm 通知',
      ko: 'Bee Swarm 알림',
      es: 'Notificación de Bee Swarm',
      fr: 'Notification Bee Swarm',
      de: 'Bee Swarm Benachrichtigung',
    },
    'View Details': {
      zh: '查看详情',
      en: 'View Details',
      ja: '詳細を見る',
      ko: '자세히 보기',
      es: 'Ver Detalles',
      fr: 'Voir les Détails',
      de: 'Details Ansehen',
    },
    'Sent at': {
      zh: '发送于',
      en: 'Sent at',
      ja: '送信日時',
      ko: '전송 시간',
      es: 'Enviado a las',
      fr: 'Envoyé à',
      de: 'Gesendet um',
    },
  };

  if (customTranslations) {
    Object.assign(translations, customTranslations);
  }

  for (const [key, translationsMap] of Object.entries(translations)) {
    if (text.includes(key) && translationsMap[targetLang]) {
      text = text.replace(key, translationsMap[targetLang]!);
    }
  }

  return text;
}

export function translateContent(
  content: { title: string; body?: string; url?: string },
  targetLanguages: Language[],
  customTranslations?: Record<string, Partial<Record<Language, string>>>
): TranslatedContent[] {
  return targetLanguages.map((lang) => ({
    title: translateText(content.title, lang, customTranslations),
    body: content.body ? translateText(content.body, lang, customTranslations) : undefined,
    url: content.url,
    language: lang,
  }));
}
