// Читающий зонд (запуск 130, v3): точная сигнатура подкласса из запусков 128/129
// («одно событие — две страницы источника, архивируемая датирована финальным днём»):
//   карточка A — МНОГОДНЕВНАЯ (end_date > start_date),
//   карточка B — ОДНОДНЕВНАЯ, её start_date РАВЕН end_date карточки A,
//   общая точка/площадка и >=2 общих значимых слова в названии.
// Это и есть кандидаты «слаг финального дня». Базу не меняет.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const FALLBACKS = [
  [12.2388, 109.1967], [16.0544, 108.2022],
  [35.1856, 33.3823], [34.7071, 33.0226], [34.7754, 32.4245], [34.9182, 33.6194], [35.1205, 33.9432],
  [-8.4095, 115.1889],
];
const onFallback = (lat, lng) =>
  FALLBACKS.some(([a, b]) => Math.abs(lat - a) <= 0.0012 && Math.abs(lng - b) <= 0.0012);

const STOP = new Set([
  'the','and','of','in','at','to','for','with','night','festival','show','live','day','days',
  '2026','2025','2027','cyprus','bali','ubud','день','ночь','вечер','утро','показ','кинопоказ',
  'занятие','октября','ноября','декабря','сентября',
]);
const toks = (s) =>
  String(s || '').toLowerCase().replace(/[^a-zа-яё0-9\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
const day = (s) => String(s || '').slice(0, 10);
const addrKey = (a) =>
  String(a || '').toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').split(/\s+/).filter((w) => w.length > 3);

const live = await selectAll(
  db,
  'events',
  'id,title,title_ru,title_en,start_date,start_time,end_date,end_time,city,address,lat,lng,website,status',
  { filter: (q) => q.in('status', ['active', 'moderation']) },
);

const multi = live.filter(
  (e) => e.lat != null && e.lng != null && e.start_date && e.end_date && day(e.end_date) > day(e.start_date)
    && !onFallback(Number(e.lat), Number(e.lng)),
);
const single = live.filter(
  (e) => e.lat != null && e.lng != null && e.start_date && (!e.end_date || day(e.end_date) === day(e.start_date))
    && !onFallback(Number(e.lat), Number(e.lng)),
);
console.log(`живых ${live.length}; многодневных живых (не фолбэк) ${multi.length}; однодневных ${single.length}`);

const hits = [];
for (const a of multi) {
  for (const b of single) {
    if (day(b.start_date) !== day(a.end_date)) continue;
    if (String(a.id) === String(b.id)) continue;
    const near = Math.abs(Number(a.lat) - Number(b.lat)) <= 0.005 && Math.abs(Number(a.lng) - Number(b.lng)) <= 0.005;
    if (!near) continue;
    const ta = new Set([...toks(a.title), ...toks(a.title_ru), ...toks(a.title_en)]);
    const tb = new Set([...toks(b.title), ...toks(b.title_ru), ...toks(b.title_en)]);
    let ov = 0;
    for (const t of tb) if (ta.has(t)) ov++;
    const wa = new Set(addrKey(a.address));
    const wb = new Set(addrKey(b.address));
    let av = 0;
    for (const t of wb) if (wa.has(t)) av++;
    if (ov + av < 2) continue;
    hits.push({ a, b, ov, av });
  }
}

console.log(`\nкандидатов «финальный день многодневного»: ${hits.length}`);
for (const h of hits) {
  const d = (e) => `${String(e.id).slice(0, 8)} ${e.status} ${day(e.start_date)}${e.start_time ? ' ' + e.start_time : ''}→${day(e.end_date) || '—'}${e.end_time ? ' ' + e.end_time : ''}`;
  console.log(`\n[общих слов ${h.ov}, общих слов адреса ${h.av}]`);
  console.log(`  МНОГОДНЕВНАЯ: ${d(h.a)} | ${h.a.city} | ${String(h.a.title).slice(0, 78)}`);
  console.log(`     адрес: ${h.a.address}`);
  console.log(`     сайт : ${h.a.website}`);
  console.log(`  ФИН. ДЕНЬ   : ${d(h.b)} | ${h.b.city} | ${String(h.b.title).slice(0, 78)}`);
  console.log(`     адрес: ${h.b.address}`);
  console.log(`     сайт : ${h.b.website}`);
}
