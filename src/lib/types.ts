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

/** Правило повтора регулярного события (null у разовых) */
export interface Recurrence {
  /** 'daily' = каждый день; 'weekly' = еженедельно по дням недели */
  freq: 'daily' | 'weekly';
  /** Дни недели для weekly: 1=Пн … 7=Вс (ISO) */
  days?: number[];
}

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
  /** Языки мероприятия (несколько): ['en', 'ru'] — приоритетнее, чем language */
  languages?: string[];
  /** Даты: ISO-формат (YYYY-MM-DD) */
  start_date: string;
  end_date?: string;
  /** Правило повтора: null/отсутствует = разовое событие */
  recurrence?: Recurrence | null;
  /** Точное время начала/конца (HH:MM, местное) */
  start_time?: string;
  end_time?: string;
  /** Город и адрес — единые, без перевода */
  city: string;
  address?: string;
  /** Координаты могут отсутствовать (событие с адресом, но без геокода) */
  lat: number | null;
  lng: number | null;
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
  /** Донат: вход бесплатный, можно пожертвовать */
  donation?: boolean;
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
  /** Дата: 'today' | 'tomorrow' | конкретная дата YYYY-MM-DD */
  date?: string;
  /** Цена: любая / бесплатные / платные / донат */
  price: 'any' | 'free' | 'paid' | 'donation';
  /** Диапазон цены (в USD) */
  priceMin?: number;
  priceMax?: number;
  /** Валюта события */
  currency?: string | null;
  /** Язык мероприятия */
  language?: string | null;
  /** Страна события */
  country?: string | null;
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
  /** Название организатора (публичный профиль) */
  display_name?: string | null;
  /** Описание организатора (публичный профиль) */
  bio?: string | null;
  /** Путь к аватарке в storage (как photos) */
  avatar_url?: string | null;
  /** Показывать контакты публично на странице организатора */
  contacts_public?: boolean;
  /** Когда организатор последний раз открывал «Мои события» (для бейджа) */
  last_seen_my_events_at?: string | null;
  /** Когда админ последний раз открывал вкладку «Модерация» (для бейджа) */
  last_seen_moderation_at?: string | null;
  /** Когда пользователь заблокирован (null = не заблокирован) */
  blocked_at?: string | null;
}

/**
 * Публичный профиль организатора (страница #/org/<id>).
 * Контакты приходят из RPC get_org_profile: отдаются только если
 * организатор включил contacts_public, иначе — null.
 */
export interface OrgProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  contacts_public: boolean;
  contact_telegram?: string | null;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  instagram?: string | null;
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

/** Строка статистики пользователя для админки (вкладка «Пользователи») */
export interface UserStatsRow {
  user_id: string;
  email: string;
  role: UserRole;
  created_at: string;
  contact_telegram?: string | null;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  instagram?: string | null;
  events_total: number;
  events_active: number;
  events_moderation: number;
  events_rejected: number;
  events_archived: number;
  events_needs_changes: number;
  /** Когда пользователь заблокирован (null = не заблокирован) */
  blocked_at?: string | null;
  categories: Array<{
    category_id: string;
    name_ru: string;
    name_en: string;
    count: number;
  }>;
}
