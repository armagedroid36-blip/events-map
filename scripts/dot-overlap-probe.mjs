// Читающий зонд (запуск 130, v2): подкласс «одно событие — две страницы источника,
// архивируемая датирована финальным днём» — расширение признака запусков 128/129
// с «одно и то же время старта» на «пересекающиеся интервалы».
// Отсев шума: точки-центровые фолбэки городов (там десятки разных событий),
// обязательное пересечение значимых слов названия (>=2). Базу не меняет.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const FALLBACKS = [
  [12.2388, 109.1967], // Нячанг
  [16.0544, 108.2022], // Дананг
  [35.1856, 33.3823], // Никосия
  [34.7071, 33.0226], // Лимасол
  [34.7754, 32.4245], // Пафос
  [34.9182, 33.6194], // Ларнака
  [35.1205, 33.9432], // Фамагуста
  [-8.4095, 115.1889], // Бали (центр острова)
];
const onFallback = (lat, lng) =>
  FALLBACKS.some(([a, b]) => Math.abs(lat - a) <= 0.0012 && Math.abs(lng - b) <= 0.0012);

const STOP = new Set([
  'the', 'and', 'of', 'in', 'at', 'a', 'an', 'to', 'for', 'with', 'night', 'festival',
  '2026', '2025', '2027', 'cyprus', 'limassol', 'nicosia', 'larnaca', 'paphos', 'bali',
  'день', 'ночь', 'вечер', 'утро', 'в', 'на', 'и', 'с', 'от', 'до', 'по', 'для',
]);
const toks = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

const live = await selectAll(
  db,
  'events',
  'id,title,title_ru,title_en,start_date,start_time,end_date,end_time,city,address,lat,lng,website,status',
  { filter: (q) => q.in('status', ['active', 'moderation']) },
);
const day = (s) => String(s || '').slice(0, 10);
const dnum = (s) => {
  const t = Date.parse(`${day(s)}T00:00:00Z`);
  return Number.isNaN(t) ? null : t / 86400000;
};

const groups = new Map();
for (const e of live) {
  if (e.lat == null || e.lng == null || !e.start_date) continue;
  if (onFallback(Number(e.lat), Number(e.lng))) continue;
  const k = `${Number(e.lat).toFixed(3)}|${Number(e.lng).toFixed(3)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

let pairs = 0;
const hits = [];
for (const [k, arr] of groups) {
  if (arr.length < 2) continue;
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i];
      const b = arr[j];
      const sa = dnum(a.start_date);
      const sb = dnum(b.start_date);
      if (sa == null || sb == null) continue;
      const ea = dnum(a.end_date) ?? sa;
      const eb = dnum(b.end_date) ?? sb;
      if (!(sa <= eb && sb <= ea)) continue;
      const aInB = sa >= sb && ea <= eb;
      const bInA = sb >= sa && eb <= ea;
      if (!aInB && !bInA) continue;
      const ta = new Set([...toks(a.title), ...toks(a.title_ru), ...toks(a.title_en)]);
      const tb = new Set([...toks(b.title), ...toks(b.title_ru), ...toks(b.title_en)]);
      let ov = 0;
      for (const t of tb) if (ta.has(t)) ov++;
      pairs++;
      if (ov >= 2) hits.push({ k, a, b, ov, aInB });
    }
}

console.log(`живых ${live.length}; пар «вложенные интервалы, не фолбэк»: ${pairs}; из них с общими словами >=2: ${hits.length}`);
for (const h of hits) {
  const outer = h.aInB ? h.b : h.a;
  const inner = h.aInB ? h.a : h.b;
  const d = (e) => `${String(e.id).slice(0, 8)} ${e.status} ${day(e.start_date)}${e.start_time ? ' ' + e.start_time : ''}→${day(e.end_date) || '—'}${e.end_time ? ' ' + e.end_time : ''}`;
  console.log(`\n[${h.k}] общих слов ${h.ov}`);
  console.log(`  ВНЕШНЯЯ: ${d(outer)} | ${outer.city} | ${String(outer.title).slice(0, 75)}`);
  console.log(`          адрес: ${outer.address}`);
  console.log(`          сайт : ${outer.website}`);
  console.log(`  ВНУТРИ : ${d(inner)} | ${inner.city} | ${String(inner.title).slice(0, 75)}`);
  console.log(`          адрес: ${inner.address}`);
  console.log(`          сайт : ${inner.website}`);
}
