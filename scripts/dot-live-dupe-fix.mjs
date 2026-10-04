// Живые дубли одного события (разные URL и/или перевод названия у источника).
//
// Класс дефекта: у Cyprus Now (и афиш) одно событие лежит под несколькими URL —
// «Street Food & Art Festival: 5th Edition in Palaichori» и «Street Food & Art
// Festival at Palaichori Park», у забега Мариоса Агатангелу — 4 карточки.
// Ключ `title|start_date` слеп к ним (названия переведены по-разному), поэтому
// на карте две-четыре точки на одно событие.
//
// Строгий ключ: тот же день + тот же нормализованный город +
// пересечение значимых слов >= 3 у ЛЮБОЙ пары псевдонимов title/title_ru/title_en.
// Keeper — самый полный (фото, описание, EN, не городской адрес-заглушка),
// при равенстве — старше по created_at. Проигравший уезжает в archived (не удаляем).
//
// Запуск: node --env-file=.env scripts/dot-live-dupe-fix.mjs            # сухой прогон
//         node --env-file=.env scripts/dot-live-dupe-fix.mjs --apply    # ремонт
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,photos,description_ru,description_en,created_at', {
  filter: (q) => q.eq('status', 'active'),
});

const STOP = new Set(['festival', 'фестиваль', 'day', 'night', 'the', 'and', 'for', 'with', 'from', '2026', '2027',
  'для', 'день', 'ночь', 'при', 'как', 'или', 'это', 'bali', 'кипр', 'cyprus', 'international', 'международный']);
// Слова-шаблоны: сами по себе не доказывают, что это одно событие
// (иначе «Деревня Рождества Фикарду» склеится с «Деревней Рождества Какопетрия»).
const GENERIC = new Set(['village', 'деревня', 'деревне', 'деревни', 'christmas', 'рождества', 'рождественская',
  'рождественской', 'program', 'программа', 'программу', 'edition', 'выпуск', 'series', 'live', 'show', 'шоу',
  'tour', 'тур', 'event', 'race', 'забег', 'марафон', 'fest', 'music', 'музыка', 'музыки', 'theatre', 'theater',
  'театр', 'театре', 'comedy', 'комедия', 'комедии', 'night', 'nights', 'party', 'вечеринка', 'nightlife',
  'dance', 'dances', 'танца', 'танцевальные', 'танцевальный', 'представления', 'представление',
  'performance', 'performances', 'искусства', 'art']);
// Топонимы-«вода»: сами по себе не доказывают одно место
// (иначе «Танцевальные представления в Ubud Palace» склеится с храмом Сарасвати).
const PLACE_STOP = new Set(['ubud', 'bali', 'jl', 'jalan', 'raya', 'индонезия', 'indonesia', 'кипр', 'cyprus',
  'kecamatan', 'kabupaten', 'gianyar', 'лимассол', 'никосия', 'ларнака', 'пафос', 'limassol', 'nicosia',
  'pura', 'dalem', 'taman', 'banjar', 'bale', 'temple', 'храм', 'храме', 'palace', 'дворец']);

function hasCoords(r) { return typeof r.lat === 'number' && typeof r.lng === 'number'; }
function distanceM(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/** Одно и то же место? Общий не-шаблонный значимый токен адреса, те же координаты (±300 м)
 *  или адрес-заглушка «<город>, Кипр» у одной из карточек (источник не дал площадку). */
function samePlace(a, b) {
  const na = norm(a.address), nb = norm(b.address);
  if (na && na === nb) return 'адрес=';
  const ws = (s) => new Set(words(s).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w)));
  const sa = ws(na), sb = ws(nb);
  for (const w of sa) if (sb.has(w)) return `адрес~${w}`;
  if (hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 300) return 'коорд≤300м';
  if ((isCityLevelAddr(a) || isCityLevelAddr(b)) && hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 5000) return 'город-заглушка';
  return null;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w)))];
const aliases = (r) => [r.title, r.title_ru, r.title_en].map(norm).filter(Boolean);
const cityKey = (r) => norm(r.city).replace(/,\s*(кипр|bali|бали|vietnam|вьетнам)$/, '');
const isCityLevelAddr = (r) => {
  const a = norm(r.address), c = cityKey(r), ct = c.split(' ')[0];
  return !a || a === `${c} кипр` || a === c || (c && (a === `${c} bali` || a === ct));
};

function overlap(a, b) {
  let best = 0;
  for (const wa of aliases(a)) for (const wb of aliases(b)) {
    const sb = new Set(words(wb));
    let n = 0; for (const w of words(wa)) if (sb.has(w)) n++;
    best = Math.max(best, n);
  }
  return best;
}
const score = (r) => (Array.isArray(r.photos) && r.photos.length ? 2 : 0)
  + (r.description_ru ? 1 : 0) + (r.description_en ? 1 : 0) + (r.title_en ? 1 : 0)
  + (isCityLevelAddr(r) ? 0 : 2);

// union-find по парам
const parent = new Map();
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
for (const r of rows) parent.set(r.id, r.id);

const groups = new Map();
for (const r of rows) {
  const k = `${(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const pairs = [];
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const n = overlap(g[i], g[j]);
    const place = n >= 3 ? samePlace(g[i], g[j]) : null;
    if (n >= 3 && place) { pairs.push([k, g[i], g[j], n, place]); union(g[i].id, g[j].id); }
  }
}
const clusters = new Map();
for (const r of rows) {
  const root = find(r.id);
  if (!clusters.has(root)) clusters.set(root, []);
  clusters.get(root).push(r);
}
const dupeClusters = [...clusters.values()].filter((g) => g.length > 1);
const losers = [];
console.log(`ACTIVE ${rows.length}; пар ${pairs.length}; групп дублей ${dupeClusters.length}`);
for (const g of dupeClusters) {
  const sorted = [...g].sort((a, b) => (score(b) - score(a)) || (String(a.created_at).localeCompare(String(b.created_at))));
  const keep = sorted[0];
  console.log(`--- ${keep.start_date?.slice(0, 10)} ${cityKey(keep)} (${g.length}) keeper ${keep.id.slice(0, 8)} «${(keep.title_ru || keep.title).slice(0, 50)}» [фото ${(keep.photos || []).length}, адрес ${keep.address}, ${keep.source_type}]`);
  for (const l of sorted.slice(1)) {
    losers.push(l.id);
    console.log(`      архив ${l.id.slice(0, 8)} «${(l.title_ru || l.title).slice(0, 50)}» [фото ${(l.photos || []).length}, адрес ${l.address}, ${l.source_type}] — слов ${overlap(keep, l)}, место: ${samePlace(keep, l)}${hasCoords(keep) && hasCoords(l) ? ', ' + Math.round(distanceM(keep, l)) + 'м' : ''}`);
  }
}
console.log(`к архивации: ${losers.length}`);
if (!APPLY) { console.log('DRY RUN (для ремонта: --apply)'); process.exit(0); }
let done = 0;
for (let i = 0; i < losers.length; i += 50) {
  const part = losers.slice(i, i + 50);
  const { error } = await db.from('events').update({ status: 'archived' }).in('id', part);
  if (error) { console.error('ошибка:', error.message); continue; }
  done += part.length;
}
console.log(`заархивировано: ${done}`);
