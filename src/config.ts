// ============================================================
// ЕДИНЫЙ ФАЙЛ КОНФИГУРАЦИИ САЙТА
// Все настройки (адрес базы, ключи) — только здесь, не в коде.
// При переносе на другой сервер или другую базу меняется только этот файл.
// ============================================================

export const config = {
  // --- База данных Supabase (заполняется, когда будет создан аккаунт) ---
  // Значения берутся из файла .env в корне проекта (см. README).
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  // Пароль входа в админку (MVP; хранится в .env)
  adminPassword: import.meta.env.VITE_ADMIN_PASSWORD ?? '',

  // --- Режим демо ---
  // true: сайт работает БЕЗ базы данных, с примерами событий (для проверки).
  // false: работа с реальной базой Supabase. Переключить после подключения базы.
  demoMode: false,

  // Версия сборки — показывается в шапке мелким текстом для сверки
  buildVersion: 'v17.08-8',

  // --- Карта ---
  // Центр по умолчанию — Юго-Восточная Азия (используется, если посетитель
  // не разрешил геолокацию). Координаты: середина региона Бали-Бангкок-Хошимин.
  defaultCenter: { lat: 10.2, lng: 108.5 },
  defaultZoom: 4,

  // Быстрые кнопки популярных направлений (карта и поиск).
  // Названия на двух языках — переключаются вместе с языком интерфейса.
  quickLocations: [
    { label: 'Бали', labelEn: 'Bali', lat: -8.5, lng: 115.2, zoom: 10 },
    { label: 'Дананг', labelEn: 'Da Nang', lat: 16.05, lng: 108.22, zoom: 11 },
    { label: 'Нячанг', labelEn: 'Nha Trang', lat: 12.24, lng: 109.19, zoom: 11 },
  ],

  // --- Геокодинг (адрес -> координаты) ---
  // OpenStreetMap Nominatim — бесплатно, без ключа. Приватный сервер снимает лимиты.
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',

  // --- Категории по умолчанию (можно менять в админке) ---
  defaultCategories: [
    { id: 'conference', name_ru: 'Конференции', name_en: 'Conferences', emoji: '💼' },
    { id: 'exhibition', name_ru: 'Выставки', name_en: 'Exhibitions', emoji: '🖼️' },
    { id: 'concert', name_ru: 'Концерты', name_en: 'Concerts', emoji: '🎤' },
    { id: 'sport', name_ru: 'Спорт', name_en: 'Sports', emoji: '🏃' },
    { id: 'lecture', name_ru: 'Лекции', name_en: 'Lectures', emoji: '📚' },
    { id: 'party', name_ru: 'Вечеринки', name_en: 'Parties', emoji: '🪩' },
    { id: 'festival', name_ru: 'Фестивали', name_en: 'Festivals', emoji: '🎉' },
    { id: 'food', name_ru: 'Еда и напитки', name_en: 'Food & Drink', emoji: '🍜' },
  ],
};
