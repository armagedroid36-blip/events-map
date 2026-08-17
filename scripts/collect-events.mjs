// Сборщик событий (этап 4): Ticketmaster API → база Supabase (статус «на модерации»).
// Запускается по расписанию в GitHub Actions (или вручную).
// Переменные окружения: TICKETMASTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js';

const API_KEY = process.env.TICKETMASTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: TICKETMASTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Запросы: страна (страны, где Ticketmaster реально работает)
const QUERIES = [
  { name: 'Сингапур', countryCode: 'SG' },
  { name: 'Филиппины', countryCode: 'PH' },
];

// Координаты ключевых городов (если у события нет координат)
const CITY_COORDS = {
  Singapore: [1.35, 103.82],
  Manila: [14.6, 120.98],
  'Quezon City': [14.65, 121.03],
  'Makati': [14.55, 121.03],
  'Taguig': [14.55, 121.05],
  'Pasay': [14.54, 120.99],
  'Bangkok': [13.75, 100.5],
  'Jakarta': [-6.2, 106.82],
  'Kuala Lumpur': [3.14, 101.69],
  'Ho Chi Minh City': [10.82, 106.63],
  'Ubud': [-8.5, 115.26],
  'Canggu': [-8.65, 115.13],
  'Denpasar': [-8.65, 115.22],
  'Phuket': [7.98, 98.34],
};

// Сегменты Ticketmaster → наши категории
const CAT_MAP = {
  Music: 'concert',
  Sports: 'sport',
  'Arts & Theatre': 'exhibition',
  Film: 'lecture',
  'Food & Drink': 'food',
  Community: 'festival',
  Business: 'conference',
  Education: 'lecture',
};
const DEFAULT_CAT = 'lecture';

const MAX_EVENTS = 40; // лимит на один запуск
const DAYS_AHEAD = 90;

function isoDays(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function fetchEvents(query) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    size: '50',
    sort: 'date,asc',
    startDateTime: `${isoDays(1)}T00:00:00Z`,
    endDateTime: `${isoDays(DAYS_AHEAD)}T23:59:59Z`,
  });
  if (query.countryCode) params.set('countryCode', query.countryCode);

  const res = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) {
    console.error(`  Ticketmaster ${query.name}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data._embedded?.events) || [];
}

async function existingKeys() {
  const { data } = await db.from('events').select('title, start_date').eq('status', 'moderation');
  return new Set((data || []).map((e) => `${e.title}|${e.start_date}`));
}

function categoryOf(ev) {
  const seg = ev.classifications?.[0]?.segment?.name;
  return CAT_MAP[seg] || DEFAULT_CAT;
}

async function main() {
  const seen = await existingKeys();
  let inserted = 0;
  let skipped = 0;

  for (const query of QUERIES) {
    if (inserted >= MAX_EVENTS) break;
    console.log(`Собираю: ${query.name}...`);
    const events = await fetchEvents(query);
    for (const ev of events) {
      if (inserted >= MAX_EVENTS) break;
      if (!ev.name) continue;
      const start = ev.dates?.start || {};
      const startDate = start.localDate;
      if (!startDate) continue;
      const key = `${ev.name}|${startDate}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      const venue = ev._embedded?.venues?.[0] || {};
      const city = venue.city?.name || '';
      let lat = parseFloat(venue.location?.latitude) || null;
      let lng = parseFloat(venue.location?.longitude) || null;
      // У многих событий Ticketmaster нет координат — берём центр города
      if (lat === null || lng === null) {
        const coords = CITY_COORDS[city] || CITY_COORDS[city.split(' ')[0]];
        if (coords) {
          lat = coords[0];
          lng = coords[1];
        }
      }
      if (!city || lat === null || lng === null) continue; // без места не берём

      const image = ev.images?.find((i) => i.width && i.width >= 300) || ev.images?.[0];

      const row = {
        title: ev.name,
        title_en: ev.name,
        description: '',
        description_en: '',
        source_lang: 'en',
        start_date: startDate,
        end_date: null,
        start_time: start.localTime || null,
        end_time: null,
        city: city + (venue.country?.countryCode ? `, ${venue.country.countryCode}` : ''),
        address: venue.address?.line1 || null,
        lat,
        lng,
        category_id: categoryOf(ev),
        website: ev.url || null,
        photos: image?.url ? [image.url] : [],
        status: 'moderation',
      };

      const { error } = await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${ev.name.slice(0, 40)}»: ${error.message}`);
      } else {
        inserted++;
        seen.add(key);
        console.log(`  + ${ev.name.slice(0, 55)} (${row.city}, ${startDate})`);
      }
    }
  }

  console.log(`Готово: добавлено ${inserted}, пропущено дублей ${skipped}.`);
}

main().catch((e) => {
  console.error('Ошибка сборщика:', e.message);
  process.exit(1);
});
