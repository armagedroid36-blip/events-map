// Сборщик «местных шоу для туристов»: постоянные представления, которые идут
// каждый день (расписание стабильное, парсить страницы не нужно — источники
// проверены вручную). События регулярные (recurrence daily, без end_date —
// архив их не трогает).
// Сейчас: VinWonders Nha Trang (остров Хон Че) — Tata Show и Once Show.
// Запускается в GitHub Actions после collect-bali.mjs; статус — «на модерации».
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';

// Постоянные шоу: title (ru), title_en, описание (ru/en), координаты, категория,
// website (стабильный ключ дедупликации), фото (обложки с официального сайта).
const SHOWS = [
  {
    title: 'Tata Show в VinWonders',
    title_en: 'Tata Show at VinWonders',
    description:
      'Грандиозное цирковое шоу принцессы Таты: акробатика, трюки и спецэффекты. Ежедневно в парке VinWonders Nha Trang (остров Хон Че).',
    description_en:
      'The spectacular circus show of Princess Tata: acrobatics, stunts and special effects. Daily at VinWonders Nha Trang (Hon Tre island).',
    city: 'Нячанг',
    lat: 12.2186,
    lng: 109.241,
    website: 'https://vinwonders.com/en/tata-show/',
    photo: 'https://static.vinwonders.com/2022/05/Hinh-anh-VinWonders-Nha-Trang-Fairy-land-Tata-show-3x2-so-3.jpg',
  },
  {
    title: 'Once Show в VinWonders',
    title_en: 'Once Show at VinWonders',
    description:
      'Мультимедийное шоу «Once»: танец, 3D-проекции на воду и музыку. Ежедневно в парке VinWonders Nha Trang (остров Хон Че).',
    description_en:
      'The "Once" multimedia show: dance, 3D water projections and music. Daily at VinWonders Nha Trang (Hon Tre island).',
    city: 'Нячанг',
    lat: 12.2186,
    lng: 109.241,
    website: 'https://vinwonders.com/en/once-show/',
    photo: 'https://static.vinwonders.com/2023/10/Hinh-anh-VinWonders-Nha-Trang-Once-Show-3x2-so-1.jpg',
  },
];

/** Есть ли уже живое событие с таким website (постоянные шоу не дублируются) */
async function existingWebsites() {
  const { data, error } = await db.from('events').select('website').in('status', ['active', 'moderation']);
  if (error) {
    console.error('Ошибка чтения дублей:', error.message);
    return new Set();
  }
  return new Set((data || []).map((e) => e.website).filter(Boolean));
}

async function main() {
  const seen = await existingWebsites();
  let inserted = 0;

  for (const s of SHOWS) {
    if (seen.has(s.website)) {
      console.log(`  = уже есть: ${s.title}`);
      continue;
    }
    const row = {
      title: s.title,
      title_ru: s.title,
      title_en: s.title_en,
      description: s.description,
      description_ru: s.description,
      description_en: s.description_en,
      source_lang: 'ru',
      language: null,
      // Первая дата — завтра (событие идёт ежедневно, бессрочно)
      start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      end_date: null,
      start_time: null,
      end_time: null,
      city: s.city,
      address: 'VinWonders Nha Trang, остров Хон Че',
      lat: s.lat,
      lng: s.lng,
      category_id: 'show',
      website: s.website,
      contact: null,
      photos: [s.photo],
      price: null,
      currency: null,
      donation: false,
      // Ежедневное представление без даты окончания — архив его не тронет
      recurrence: { freq: 'daily' },
      status: 'moderation',
    };
    const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
    if (error) {
      console.error(`  Ошибка вставки «${s.title}»: ${error.message}`);
    } else {
      inserted++;
      seen.add(s.website);
      console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${s.title} | ${row.start_date} | ежедневно | ${s.city} | show`);
    }
  }

  console.log(`Готово: добавлено ${inserted}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
