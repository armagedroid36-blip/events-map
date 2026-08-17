// Список языков мероприятий.
// Порядок: английский, русский, затем остальные по алфавиту.
export interface Language {
  code: string;
  name_ru: string;
  name_en: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name_ru: 'Английский', name_en: 'English' },
  { code: 'ru', name_ru: 'Русский', name_en: 'Russian' },
  { code: 'ar', name_ru: 'Арабский', name_en: 'Arabic' },
  { code: 'id', name_ru: 'Индонезийский', name_en: 'Indonesian' },
  { code: 'es', name_ru: 'Испанский', name_en: 'Spanish' },
  { code: 'it', name_ru: 'Итальянский', name_en: 'Italian' },
  { code: 'zh', name_ru: 'Китайский', name_en: 'Chinese' },
  { code: 'ko', name_ru: 'Корейский', name_en: 'Korean' },
  { code: 'ms', name_ru: 'Малайский', name_en: 'Malay' },
  { code: 'de', name_ru: 'Немецкий', name_en: 'German' },
  { code: 'nl', name_ru: 'Нидерландский', name_en: 'Dutch' },
  { code: 'pl', name_ru: 'Польский', name_en: 'Polish' },
  { code: 'pt', name_ru: 'Португальский', name_en: 'Portuguese' },
  { code: 'th', name_ru: 'Тайский', name_en: 'Thai' },
  { code: 'vi', name_ru: 'Вьетнамский', name_en: 'Vietnamese' },
  { code: 'fr', name_ru: 'Французский', name_en: 'French' },
  { code: 'hi', name_ru: 'Хинди', name_en: 'Hindi' },
  { code: 'ja', name_ru: 'Японский', name_en: 'Japanese' },
];

/** Название языка на языке интерфейса */
export function languageName(code: string | null | undefined, lang: 'ru' | 'en'): string {
  if (!code) return '';
  const l = LANGUAGES.find((x) => x.code === code);
  if (!l) return code;
  return lang === 'ru' ? l.name_ru : l.name_en;
}
