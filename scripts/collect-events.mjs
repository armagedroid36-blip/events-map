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

// ===== Источник 2: Ticketbox (Вьетнам) — события с городами и координатами =====

// Категории Ticketbox → наши
const TB_CAT = { 1: 'concert', 2: 'exhibition', 3: 'sport', 4: 'lecture', 5: 'festival', 6: 'lecture' };
const TB_DEFAULT_CAT = 'lecture';

async function tbList() {
  // События Вьетнама на ближайшие месяцы
  const params = new URLSearchParams({
    at: 'this-month',
    from: isoDays(1),
    to: isoDays(DAYS_AHEAD),
  });
  const res = await fetch(`https://api-v2.ticketbox.vn/search/v2/recommended-events?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return [];
  const d = await res.json();
  return d.data?.results || [];
}

async function tbDetails(url) {
  // Страница события содержит JSON с городом и координатами
  const res = await fetch(`https://ticketbox.vn/${url}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    const s = JSON.stringify(d);
    const lat = parseFloat((s.match(/"latitude"\s*:\s*"([^"]+)"/) || [])[1]);
    const lng = parseFloat((s.match(/"longitude"\s*:\s*"([^"]+)"/) || [])[1]);
    // Город ищем по известным названиям городов Вьетнама
    const CITY_NAMES = [
      'Ho Chi Minh City', 'Hồ Chí Minh', 'Hanoi', 'Hà Nội', 'Da Nang', 'Đà Nẵng',
      'Nha Trang', 'Đà Lạt', 'Dalat', 'Hue', 'Huế', 'Phu Quoc', 'Quy Nhon',
      'Ha Long', 'Vung Tau', 'Can Tho',
    ];
    let city = '';
    for (const c of CITY_NAMES) {
      if (s.includes(c)) {
        city = c;
        break;
      }
    }
    const addr = (s.match(/"streetAddress"\s*:\s*"([^"]+)"/) || [])[1] || null;
    // SEO-описание события (там, где есть)
    const descMatch = s.match(/"description"\s*:\s*"((?:[^"\\]|\\.){30,400})"/);
    const description = descMatch ? descMatch[1] : '';
    if (!city || !lat || !lng) return null;
    return { city, lat, lng, address: addr, description };
  } catch {
    return null;
  }
}

async function collectTicketbox(seen, limit, insertedCount) {
  const list = await tbList();
  let added = 0;
  for (const ev of list) {
    if (insertedCount + added >= limit) break;
    if (!ev.name || !ev.day) continue;
    const startDate = ev.day.slice(0, 10);
    const key = `${ev.name}|${startDate}`;
    if (seen.has(key)) continue;

    const urlPath = (ev.deeplink || ev.url || '').replace(/^https:\/\/ticketbox\.vn\//, '').split('?')[0];
    if (!urlPath) continue;
    const det = await tbDetails(urlPath);
    if (!det) continue;

    const row = {
      title: ev.name,
      title_en: ev.name,
      description: det.description || '',
      description_en: det.description || '',
      source_lang: 'en',
      start_date: startDate,
      end_date: null,
      start_time: ev.day.length > 10 ? ev.day.slice(11, 16) : null,
      end_time: null,
      city: det.city,
      address: det.address,
      lat: det.lat,
      lng: det.lng,
      category_id: TB_CAT[ev.categories?.[0]] || TB_DEFAULT_CAT,
      website: `https://ticketbox.vn/${urlPath}`,
      photos: ev.imageUrl ? [ev.imageUrl] : [],
      price: ev.price ? ev.price : null,
      currency: ev.price ? 'vnd' : null,
      status: 'moderation',
    };
    const { error } = await db.from('events').insert(row);
    if (error) {
      console.error(`  Ошибка вставки «${ev.name.slice(0, 40)}»: ${error.message}`);
    } else {
      added++;
      seen.add(key);
      console.log(`  + ${ev.name.slice(0, 55)} (${det.city}, ${startDate})`);
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
      const pr = ev.priceRanges?.[0];

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
        price: pr ? pr.min : null,
        currency: pr ? (pr.currency || 'USD').toLowerCase() : null,
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

  // Источник 2: Ticketbox (Вьетнам)
  console.log('Собираю: Ticketbox (Вьетнам)...');
  inserted += await collectTicketbox(seen, MAX_EVENTS, inserted);

  // Дозаполняем описания у Ticketbox-событий, собранных раньше
  console.log('Дозаполняю описания Ticketbox...');
  await updateTicketboxDescriptions();

  console.log(`Готово: добавлено ${inserted}, пропущено дублей ${skipped}.`);
}

// Обновляет пустые описания у ранее собранных событий Ticketbox
async function updateTicketboxDescriptions() {
  const { data, error } = await db
    .from('events')
    .select('id, website')
    .like('website', '%ticketbox.vn%')
    .or('description.is.null,description.eq.');
  if (error || !data) return;
  let updated = 0;
  for (const ev of data) {
    const urlPath = (ev.website || '').replace(/^https:\/\/ticketbox\.vn\//, '').split('?')[0];
    if (!urlPath) continue;
    const det = await tbDetails(urlPath);
    if (!det?.description) continue;
    const { error: uErr } = await db
      .from('events')
      .update({ description: det.description, description_en: det.description })
      .eq('id', ev.id);
    if (!uErr) {
      updated++;
      console.log(`  ~ обновлено описание: ${urlPath.slice(0, 40)}`);
    }
  }
  if (updated) console.log(`Описаний дозаполнено: ${updated}.`);
}

main().catch((e) => {
  console.error('Ошибка сборщика:', e.message);
  process.exit(1);
});
