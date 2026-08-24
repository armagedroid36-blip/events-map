// Валидация и нормализация контактов (общая для регистрации, формы события
// и профиля). Поля необязательные: пустая строка — допустима.
//
// Правила:
//   телефон/whatsapp — только цифры, +, пробелы, скобки, дефисы; минимум 5 цифр;
//   email — стандартный формат;
//   telegram — убираем @, t.me/, https:// (остаётся username, паттерн как в EventCard tgLink);
//   instagram — убираем @ и https://instagram.com/ (остаётся ник).
//
// Функции возвращают код ошибки (например 'badPhone'), текст ошибки берёт
// вызывающий код из i18n: t(`form.${code}`).

export type ContactField = 'telegram' | 'whatsapp' | 'phone' | 'email' | 'instagram';

export type ContactErrorCode = 'badTelegram' | 'badWhatsapp' | 'badPhone' | 'badEmail' | 'badInstagram';

/** Значения контактов (как в формах: регистрация, событие, профиль) */
export interface ContactValues {
  telegram?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  instagram?: string;
}

/** Username Telegram: @ник, t.me/ник, https://t.me/ник (с параметрами) → ник */
export function normalizeTelegram(v: string): string {
  const s = v.trim().replace(/^@/, '').replace(/^https?:\/\//, '');
  const m = s.match(/(?:t\.me\/|telegram\.me\/)?([a-zA-Z0-9_]+)/);
  return m ? m[1] : '';
}

/** Ник Instagram: @ник, https://instagram.com/ник (и www, http) → ник */
export function normalizeInstagram(v: string): string {
  let s = v.trim().replace(/^@/, '');
  s = s.replace(/^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\//, '');
  // Отбрасываем хвост после ника (пути, параметры)
  s = s.split(/[/?#]/)[0].trim();
  return s;
}

/** Телефон: оставляем как есть (валидация проверяет допустимые символы) */
export function normalizePhone(v: string): string {
  return v.trim();
}

/** Телефон/WhatsApp: цифры, +, пробелы, скобки, дефисы; минимум 5 цифр */
export function validPhone(v: string): boolean {
  const s = v.trim();
  if (!s) return true; // необязательное поле
  if (!/^[0-9+\s()\-]+$/.test(s)) return false;
  return s.replace(/\D/g, '').length >= 5;
}

/** Email: стандартный формат */
export function validEmail(v: string): boolean {
  const s = v.trim();
  if (!s) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/**
 * Проверяет контакты и возвращает ошибки по полям.
 * Пустые поля не проверяются (все контакты необязательные).
 */
export function contactErrors(values: ContactValues): Partial<Record<ContactField, ContactErrorCode>> {
  const out: Partial<Record<ContactField, ContactErrorCode>> = {};
  const v = values ?? {};

  const tg = (v.telegram ?? '').trim();
  if (tg && !normalizeTelegram(tg)) out.telegram = 'badTelegram';

  if (!validPhone(v.whatsapp ?? '')) out.whatsapp = 'badWhatsapp';
  if (!validPhone(v.phone ?? '')) out.phone = 'badPhone';
  if (!validEmail(v.email ?? '')) out.email = 'badEmail';

  const ig = (v.instagram ?? '').trim();
  if (ig && !normalizeInstagram(ig)) out.instagram = 'badInstagram';

  return out;
}

/** Нормализованные значения для сохранения (telegram/instagram — чистые ники) */
export function normalizeContacts(values: ContactValues): ContactValues {
  const v = values ?? {};
  return {
    telegram: v.telegram ? normalizeTelegram(v.telegram) : '',
    whatsapp: v.whatsapp ? normalizePhone(v.whatsapp) : '',
    phone: v.phone ? normalizePhone(v.phone) : '',
    email: v.email ? v.email.trim() : '',
    instagram: v.instagram ? normalizeInstagram(v.instagram) : '',
  };
}
