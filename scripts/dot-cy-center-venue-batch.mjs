// dot-cy-center-venue-batch.mjs — кипрские active-карточки на центровой точке, у которых
// адрес называет конкретную площадку (первое поле адреса). Группируем по площадке,
// геокодируем площадку в Nominatim ОДИН раз и ставим пин всем её карточкам.
// DRY по умолчанию; APPLY=1 — запись. MIN_GROUP — минимальное число карточек у площадки.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const MIN_GROUP = Number(process.env.MIN_GROUP || 2);
const MAX_GROUPS = Number(process.env.MAX_GROUPS || 6);
const UA = 'events-map-dot/1.0 (armagedroid@yandex.ru)';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status');

const CENTERS = { '34.7071,33.0226': 'Лимасол', '34.9182,33.6194': 'Ларнака', '35.1856,33.3823': 'Никосия', '34.7754,32.4245': 'Пафос' };
// без \b: в JS он не работает для кириллицы (слово целиком из кириллицы им не ограничивается)
const CITY_WORDS = /^(лимасол|ларнака|никосия|пафос|ая-напа|фамагуста|протарас|паралимни|полис|кирения|лимассол|limassol|larnaca|nicosia|paphos|famagusta|cyprus|кипр)(\s|,|$)/i;
const LATIN_CITY = { 'Лимасол': 'Limassol', 'Ларнака': 'Larnaca', 'Никосия': 'Nicosia', 'Пафос': 'Paphos' };
// площадка не должна быть улицей/кварталом: у Cyprus Now часто «Axiou, Agia Fylaxis…» — это адрес организации, не площадка
const NOT_VENUE = /^(axiou|улиц|street|str\.|no\.|где|tbd)/i;

const groups = new Map();
for (const r of rows) {
  if (r.status === 'archived') continue;
  const cityName = CENTERS[String(Number(r.lat)) + ',' + String(Number(r.lng))];
  if (!cityName) continue;
  const addr = (r.address || '').trim();
  if (!addr) continue;
  const venue = addr.split(/[,;]/)[0].trim();
  if (!venue || venue.length < 6 || CITY_WORDS.test(venue) || NOT_VENUE.test(venue)) continue;
  if (!groups.has(venue)) groups.set(venue, []);
  groups.get(venue).push({ id: r.id, prefix: r.id.slice(0, 8), city: r.city, title: (r.title_ru || r.title || '').slice(0, 50) });
}

const multi = [...groups.entries()].filter(([, v]) => v.length >= MIN_GROUP).sort((a, b) => b[1].length - a[1].length).slice(0, MAX_GROUPS);
console.log(`групп всего ${groups.size}, с >=${MIN_GROUP} карточками ${multi.length}; беру ${multi.length}`);

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
async function geocode(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { err: 'HTTP ' + res.status };
    const j = await res.json();
    if (!j.length) return { err: 'не найдено' };
    return { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name.slice(0, 70) };
  } catch (e) { return { err: 'fetch: ' + String(e.message || e).slice(0, 50) }; }
}

let applied = 0, skipped = 0;
for (const [venue, cards] of multi) {
  const city = (cards[0].city || '').split(',')[0].trim();
  const g = await geocode(`${venue}, ${LATIN_CITY[city] || city}, Cyprus`);
  await sleep(1200);
  console.log(`\n[${cards.length}] ${venue} (${city})`);
  if (g.err) { console.log(`   геокодер: ${g.err} -> пропуск ${cards.length}`); skipped += cards.length; continue; }
  const shift = Math.hypot((g.lat - 34.7071) * 111, (g.lng - 33.0226) * 91);
  console.log(`   -> ${g.lat},${g.lng} | ${g.label}`);
  // страховка: результат геокодера должен быть рядом с городом карточки, иначе имя площадки неоднозначно
  const center = { 'Лимасол': [34.7071, 33.0226], 'Ларнака': [34.9182, 33.6194], 'Никосия': [35.1856, 33.3823], 'Пафос': [34.7754, 32.4245] }[city];
  if (center) {
    const dCity = Math.hypot((g.lat - center[0]) * 111, (g.lng - center[1]) * 91);
    if (dCity > 30) { console.log(`   СТРАХОВКА: результат в ${dCity.toFixed(1)} км от центра ${city} -> пропуск ${cards.length}`); skipped += cards.length; continue; }
  }
  for (const c of cards) console.log(`      ${c.prefix} | ${c.title}`);
  if (!APPLY) continue;
  for (const c of cards) {
    const { data, error } = await db.from('events').update({ lat: g.lat, lng: g.lng }).eq('id', c.id).select('id,lat,lng');
    if (error || !data?.length) { console.log(`      ОШИБКА ${c.prefix}: ${error?.message || '0 строк'}`); skipped++; continue; }
    applied++;
  }
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
