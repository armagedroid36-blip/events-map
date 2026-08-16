// Сборщик событий (этап 4): Eventbrite API → база Supabase (статус «на модерации»).
// Запускается по расписанию в GitHub Actions (или вручную).
// Переменные окружения: EVENTBRITE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js';

const TOKEN = process.env.EVENTBRITE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!TOKEN || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: EVENTBRITE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Регионы сбора: Бали и ключевые города Юго-Восточной Азии
const REGIONS = [
  { name: 'Бали', lat: -8.5, lng: 115.2, within: 100 },
  { name: 'Бангкок', lat: 13.75, lng: 100.5, within: 60 },
  { name: 'Сингапур', lat: 1.35, lng: 103.82, within: 30 },
  { name: 'Хошимин', lat: 10.82, lng: 106.63, within: 60 },
  { name: 'Куала-Лумпур', lat: 3.14, lng: 101.69, within: 50 },
  { name: 'Джакарта', lat: -6.2, lng: 106.82, within: 50 },
  { name: 'Пхукет', lat: 7.98, lng: 98.34, within: 50 },
];

// Соответствие категорий Eventbrite нашим категориям
const CAT_MAP = {
  103: 'concert', // Music
  105: 'sport', // Sports & Fitness
  102: 'conference', // Science & Technology
  110: 'exhibition', // Arts
  108: 'food', // Food & Drink
  113: 'party', // Community
  104: 'lecture', // Film, Media & Entertainment
  106: 'festival', // Charity & Causes
  107: 'festival', // Family & Education
  109: 'party', // Music? нет: 109 = Health
  101: 'conference', // Business
};
const DEFAULT_CAT = 'lecture';

const MAX_EVENTS = 30; // лимит на один запуск, чтобы не заваливать модерацию
const DAYS_AHEAD = 90; // собираем события на 3 месяца вперёд

function iso(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function fetchEvents(region) {
  const url =
    `https://www.eventbriteapi.com/v3/events/search/?token=${TOKEN}` +
    `&location.latitude=${region.lat}&location.longitude=${region.lng}` +
    `&location.within=${region.within}km` +
    `&start_date.range_start=${iso(0)}T00:00:00` +
    `&start_date.range_end=${iso(DAYS_AHEAD)}T23:59:59` +
    `&expand=venue,logo&page_size=50&sort_by=date`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.error(`  Eventbrite ${region.name}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.events || [];
}

async function existingKeys() {
  // Ключи дедупликации уже добавленных событий (название+дата)
  const { data } = await db
    .from('events')
    .select('title, start_date')
    .eq('status', 'moderation');
  return new Set((data || []).map((e) => `${e.title}|${e.start_date}`));
}

async function main() {
  const seen = await existingKeys();
  let inserted = 0;
  let skipped = 0;

  for (const region of REGIONS) {
    if (inserted >= MAX_EVENTS) break;
    console.log(`Собираю: ${region.name}...`);
    const events = await fetchEvents(region);
    for (const ev of events) {
      if (inserted >= MAX_EVENTS) break;
      if (!ev.name?.text) continue;
      const startLocal = ev.start?.local;
      if (!startLocal) continue;
      const startDate = startLocal.slice(0, 10);
      const key = `${ev.name.text}|${startDate}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      const venue = ev.venue || {};
      const addr = venue.address || {};
      const city = addr.city || region.name;
      const lat = parseFloat(addr.latitude) || region.lat;
      const lng = parseFloat(addr.longitude) || region.lng;
      const desc = (ev.description?.text || '').slice(0, 2000);
      const logo = ev.logo?.url;
      const categoryId = CAT_MAP[ev.category_id] || DEFAULT_CAT;

      const row = {
        title: ev.name.text,
        title_en: ev.name.text,
        description: desc,
        description_en: desc,
        source_lang: 'en',
        start_date: startDate,
        end_date: ev.end?.local ? ev.end.local.slice(0, 10) : null,
        start_time: startLocal.length > 10 ? startLocal.slice(11, 16) : null,
        end_time: ev.end?.local && ev.end.local.length > 10 ? ev.end.local.slice(11, 16) : null,
        city,
        address: addr.address_1 || null,
        lat,
        lng,
        category_id: categoryId,
        website: ev.url || null,
        photos: logo ? [logo] : [],
        status: 'moderation',
      };

      const { error } = await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${ev.name.text.slice(0, 40)}»: ${error.message}`);
      } else {
        inserted++;
        seen.add(key);
        console.log(`  + ${ev.name.text.slice(0, 50)} (${city}, ${startDate})`);
      }
    }
  }

  console.log(`Готово: добавлено ${inserted}, пропущено дублей ${skipped}.`);
}

main().catch((e) => {
  console.error('Ошибка сборщика:', e.message);
  process.exit(1);
});
