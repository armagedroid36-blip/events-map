// ============================================================
// ЕДИНЫЙ ФАЙЛ КОНФИГУРАЦИИ САЙТА
// Все настройки (адрес базы, ключи) — только здесь, не в коде.
// При переносе на другой сервер или другую базу меняется только этот файл.
// ============================================================

// Версия политики конфиденциальности: фиксируется в profiles.consent_version
// при регистрации (согласие на обработку ПД и трансграничную передачу,
// закон Вьетнама 91/2025). Менять при КАЖДОМ изменении текстов политики
// (Privacy.tsx, ключи i18n privacy.*)
export const privacyPolicyVersion = '2026-09-03';

export const config = {
  // --- База данных Supabase (заполняется, когда будет создан аккаунт) ---
  // Значения берутся из файла .env в корне проекта (см. README).
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',

  // --- Режим демо ---
  // true: сайт работает БЕЗ базы данных, с примерами событий (для проверки).
  // false: работа с реальной базой Supabase. Переключить после подключения базы.
  demoMode: false,

  // Версия сборки — показывается в шапке мелким текстом для сверки
  buildVersion: 'beta 0.16',

  // Push-уведомления: ПУБЛИЧНЫЙ VAPID-ключ (приватный — в GitHub secrets,
  // VAPID_PRIVATE_KEY; рассылка — scripts/notify-push.mjs в GHA)
  vapidPublicKey:
    'BETuziM1TY17y3z_rCvYbP5hbmqEfIomCX1BYLUnrFAZSLLGypumv9OuSAfTYYpFquJZ07xFo5x8oc9NJOY7CUY',

  // Версия политики конфиденциальности (пишется в profiles.consent_version)
  privacyPolicyVersion,

  // Адрес сайта (для ссылок восстановления пароля Supabase)
  siteUrl: 'https://mypins.site/',

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

  // --- Тайлы карты: OpenFreeMap (MapLibre GL, брендовый стиль) ---
  // Стиль — src/lib/mapStyle.ts (map-style-brand.json). Атрибуция обязательна
  // (лицензия OSM + OpenFreeMap), показывается контролом MapLibre на всех картах.
  mapAttribution:
    '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',

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
    { id: 'cinema', name_ru: 'Киноклуб', name_en: 'Cinema Club', emoji: '🎬' },
    { id: 'wellness', name_ru: 'Йога и здоровье', name_en: 'Yoga & Wellness', emoji: '🧘' },
    { id: 'workshop', name_ru: 'Мастер-классы', name_en: 'Workshops', emoji: '🎨' },
    { id: 'games', name_ru: 'Игры и квизы', name_en: 'Games & Quizzes', emoji: '🎲' },
    { id: 'meetup', name_ru: 'Встречи и нетворкинг', name_en: 'Meetups & Networking', emoji: '🤝' },
    { id: 'tour', name_ru: 'Экскурсии и туры', name_en: 'Tours & Excursions', emoji: '🗺️' },
    { id: 'speaking', name_ru: 'Разговорный клуб', name_en: 'Speaking Club', emoji: '💬' },
  ],
};
