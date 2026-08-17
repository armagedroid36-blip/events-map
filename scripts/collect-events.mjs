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

// ===== Фильтр «для туристов и экспатов» =====
// Оставляем события, интересные приезжим: международные концерты, фестивали,
// культурные шоу, спорт, выставки. Отсекаем локальные: иероглифы, K-pop, местные жанры.

/** Название «международное»: почти все символы — латиница (нет иероглифов/тайского) */
function isLatinName(name) {
  if (!name) return false;
  const ascii = [...name].filter((ch) => ch.charCodeAt(0) < 128).length;
  return ascii / name.length >= 0.95;
}

/** Локальные жанры/исполнители, которые не интересны туристам */
const LOCAL_KEYWORDS = [
  'k-pop', 'kpop', 'korean', 'j-pop', 'jpop', 'mandopop', 'cantopop',
  'ballad', 'dandiya', 'bollywood', 'tamil', 'malayalam',
];

function isTouristFriendly(ev) {
  const name = ev.name || '';
  if (!isLatinName(name)) return false;
  const low = name.toLowerCase();
  for (const kw of LOCAL_KEYWORDS) {
    if (low.includes(kw)) return false;
  }
  // Жанр события (например, K-Pop) — тоже отсекаем
  const genre = ev.classifications?.[0]?.genre?.name || '';
  if (genre && LOCAL_KEYWORDS.some((kw) => genre.toLowerCase().includes(kw))) return false;
  // Только релевантные сегменты
  const segment = ev.classifications?.[0]?.segment?.name || '';
  if (segment && !['Music', 'Sports', 'Arts & Theatre', 'Film', 'Food & Drink', 'Miscellaneous'].includes(segment)) {
    return false;
  }
  return true;
}

// ===== Источник 1: Songkick (концерты и фестивали — для туристов) =====
// (Ticketmaster убран: в регионе почти нет событий для туристов, в основном локальные.)

const METRO_AREAS = [
  { name: 'Бали (Денпасар)', url: '/metro-areas/29138-indonesia-denpasar', lat: -8.65, lng: 115.22 },
  { name: 'Сингапур', url: '/metro-areas/32258-singapore-singapore', lat: 1.35, lng: 103.82 },
  { name: 'Бангкок', url: '/metro-areas/32333-thailand-bangkok', lat: 13.75, lng: 100.5 },
  { name: 'Куала-Лумпур', url: '/metro-areas/31146-malaysia-kuala-lumpur', lat: 3.14, lng: 101.69 },
];

/** Парсит страницу города Songkick: список событий с датами */
function parseSongkick(html, fallbackLat, fallbackLng) {
  // Координаты из JSON-LD: url концерта -> {lat, lng}
  const geoMap = {};
  const geoRe = /"url"\s*:\s*"[^"]*concerts\/(\d+)[^"]*"[\s\S]{0,500}?"latitude"\s*:\s*([0-9.]+),\s*"longitude"\s*:\s*([0-9.]+)/g;
  let gm;
  while ((gm = geoRe.exec(html)) !== null) {
    geoMap[gm[1]] = { lat: parseFloat(gm[2]), lng: parseFloat(gm[3]) };
  }

  const out = [];
  const itemRe = /<li title="([^"]+)" class="event-listings-element">([\s\S]*?)<\/li>/g;
  let m;
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[2];
    const nameM = block.match(/<strong>(.*?)<\/strong>/);
    if (!nameM) continue;
    const name = nameM[1].replace(/&amp;/g, '&').trim();
    const linkM = block.match(/href="(\/concerts\/\d+[^"]*)"/);
    const timeM = block.match(/datetime="([^"]+)"/);
    const venueM = block.match(/class="location">\s*<span>([^<]*)<\/span>/);
    if (!linkM || !timeM) continue;
    const dateTime = timeM[1]; // 2026-09-03T22:15:00+0800
    const id = linkM[1].split('/')[2].split('-')[0];
    const geo = geoMap[id];
    out.push({
      name,
      date: dateTime.slice(0, 10),
      time: dateTime.slice(11, 16),
      venue: venueM ? venueM[1].trim() : '',
      url: `https://www.songkick.com${linkM[1].split('?')[0]}`,
      lat: geo ? geo.lat : fallbackLat,
      lng: geo ? geo.lng : fallbackLng,
    });
  }
  return out;
}

async function collectSongkick(seen, limit, insertedCount) {
  let added = 0;
  for (const metro of METRO_AREAS) {
    if (insertedCount + added >= limit) break;
    console.log(`Собираю: Songkick ${metro.name}...`);
    const res = await fetch(`https://www.songkick.com${metro.url}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0', 'Accept-Language': 'en' },
    });
    if (!res.ok) {
      console.error(`  Songkick ${metro.name}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const events = parseSongkick(html, metro.lat, metro.lng);
    for (const ev of events) {
      if (insertedCount + added >= limit) break;
      const key = `${ev.name}|${ev.date}`;
      if (seen.has(key)) continue;
      // Фильтр «для туристов»
      if (!isLatinName(ev.name)) continue;
      const low = ev.name.toLowerCase();
      if (LOCAL_KEYWORDS.some((kw) => low.includes(kw))) continue;

      const row = {
        title: ev.name,
        title_en: ev.name,
        description: '',
        description_en: '',
        source_lang: 'en',
        start_date: ev.date,
        end_date: null,
        start_time: ev.time || null,
        end_time: null,
        city: metro.name.replace(' (Денпасар)', ''),
        address: ev.venue || null,
        lat: ev.lat,
        lng: ev.lng,
        category_id: 'concert',
        website: ev.url,
        photos: [],
        price: null,
        currency: null,
        status: 'moderation',
      };
      const { error } = await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${ev.name.slice(0, 40)}»: ${error.message}`);
      } else {
        added++;
        seen.add(key);
        console.log(`  + ${ev.name.slice(0, 50)} (${row.city}, ${ev.date} ${ev.time || ''})`);
      }
    }
  }
  return added;
}

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

const MAX_EVENTS = 60; // лимит на один запуск
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

  // Источник 1: Songkick (концерты и фестивали — для туристов)
  inserted += await collectSongkick(seen, MAX_EVENTS, inserted);

  console.log(`Готово: добавлено ${inserted}, пропущено дублей ${skipped}.`);
}

main().catch((e) => {
  console.error('Ошибка сборщика:', e.message);
  process.exit(1);
});
