// Типы данных проекта «События на карте».
// Все сущности описаны здесь — единый источник правды.

/** Категория события (названия на обоих языках + маркер-эмодзи) */
export interface Category {
  id: string;
  name_ru: string;
  name_en: string;
  emoji: string;
}

/** Статус события в базе */
export type EventStatus = 'active' | 'past' | 'moderation' | 'rejected' | 'archived' | 'needs_changes';

/**
 * Событие.
 * Название и описание хранятся в двух вариантах: оригинал (на языке
 * организатора) и перевод на второй язык. Перевод делается один раз
 * при сохранении — посетитель видит контент на языке интерфейса,
 * при отсутствии перевода — оригинал.
 */
export interface EventItem {
  id: string;
  /** Оригинальное название (на языке организатора) */
  title: string;
  /** Перевод названия на русский (если оригинал не на русском) */
  title_ru?: string;
  /** Перевод названия на английский (если оригинал не на английском) */
  title_en?: string;
  /** Оригинальное описание */
  description: string;
  description_ru?: string;
  description_en?: string;
  /** Язык оригинала: 'ru' | 'en' | иное */
  source_lang: string;
  /** Язык мероприятия (для посетителей): 'en', 'ru' и т.д. */
  language?: string | null;
  /** Даты: ISO-формат (YYYY-MM-DD) */
  start_date: string;
  end_date?: string;
  /** Точное время начала/конца (HH:MM, местное) */
  start_time?: string;
  end_time?: string;
  /** Город и адрес — единые, без перевода */
  city: string;
  address?: string;
  lat: number;
  lng: number;
  category_id: string;
  /** Ссылка на страницу события (внешняя) */
  website?: string;
  /** Контакт организатора */
  contact?: string;
  /** Контакты организатора для связи (видит только админ) */
  contact_telegram?: string;
  contact_whatsapp?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_instagram?: string;
  /** Цена билета (null = бесплатно) */
  price?: number | null;
  /** Валюта: 'usd' | код местной валюты (idr, thb, vnd, sgd, myr, php) */
  currency?: string | null;
  /** Страна события (для фильтра) */
  country?: string | null;
  /** Комментарий модератора при отклонении */
  reject_reason?: string | null;
  /** Фотографии: URL загруженных файлов, не больше 5 */
  photos?: string[];
  status: EventStatus;
  /** Владелец-организатор (если событие создано через аккаунт) */
  owner_id?: string;
  created_at: string;
}

/** Заявка организатора (до модерации) — поля как у события + решение админа */
export interface Application {
  id: string;
  title: string;
  description: string;
  source_lang: string;
  start_date: string;
  end_date?: string;
  city: string;
  address?: string;
  lat?: number;
  lng?: number;
  category_id: string;
  website?: string;
  contact?: string;
  photos?: string[];
  status: 'new' | 'approved' | 'rejected';
  reject_reason?: string;
  created_at: string;
}

/** Поля формы «Разместить событие» (без id/status/created_at) */
export type ApplicationDraft = Omit<
  Application,
  'id' | 'status' | 'reject_reason' | 'created_at'
>;

/** Строка для импорта из CSV/JSON */
export interface ImportRow {
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  city: string;
  address?: string;
  lat?: number;
  lng?: number;
  category_id?: string;
  website?: string;
}

/** Настройки фильтров публичной части */
export interface Filters {
  categoryId: string | null;
  /** Период: 'upcoming' | 'all' | конкретный диапазон */
  period: 'upcoming' | 'all';
  /** Цена: любая / только бесплатные / только платные */
  price: 'any' | 'free' | 'paid';
  /** Диапазон цены (в USD) */
  priceMin?: number;
  priceMax?: number;
  /** Валюта события */
  currency?: string | null;
  /** Язык мероприятия */
  language?: string | null;
  /** Страна события */
  country?: string | null;
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  query?: string;
}

/** Роль пользователя */
export type UserRole = 'admin' | 'org' | 'user';

/** Профиль пользователя (роль + контакты организатора) */
export interface Profile {
  id: string;
  role: UserRole;
  contact_telegram?: string;
  contact_whatsapp?: string;
  contact_email?: string;
  contact_phone?: string;
  instagram?: string;
}

/** Текущий пользователь (сессия) */
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Запись истории просмотров */
export interface HistoryItem {
  id: string;
  event_id: string;
  viewed_at: string;
}
