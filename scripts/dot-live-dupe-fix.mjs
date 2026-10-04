// Живые дубли одного события (разные URL и/или перевод названия у источника).
//
// Класс дефекта: у Cyprus Now (и афиш) одно событие лежит под несколькими URL —
// «Street Food & Art Festival: 5th Edition in Palaichori» и «Street Food & Art
// Festival at Palaichori Park», у забега Мариоса Агатангелу — 4 карточки.
// Ключ `title|start_date` слеп к ним (названия переведены по-разному), поэтому
// на карте две-четыре точки на одно событие.
//
// Строгий ключ живёт в scripts/live-dupe-key.mjs (тот же, что теперь в штатном
// dedupe-events.mjs): день + нормализованный город + >=3 общих значимых слова
// по любой паре псевдонимов title/title_ru/title_en + «то же место».
// Keeper — самый полный (фото, описание, EN, не городской адрес-заглушка),
// при равенстве — старше по created_at. Проигравший уезжает в archived (не удаляем).
//
// Запуск: node --env-file=.env scripts/dot-live-dupe-fix.mjs            # сухой прогон
//         node --env-file=.env scripts/dot-live-dupe-fix.mjs --apply    # ремонт
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { norm, aliases, cityKey, isCityLevelAddr, hasCoords, distanceM, samePlace, overlap, liveDupeMatch } from './live-dupe-key.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,photos,description_ru,description_en,created_at', {
  filter: (q) => q.eq('status', 'active'),
});

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
    const reason = liveDupeMatch(g[i], g[j]);
    if (reason) { pairs.push([k, g[i], g[j], n, reason]); union(g[i].id, g[j].id); }
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
