// Зонд класса «ложная архивация одного события из-за склейки разных событий одной площадки»
// (корень закрыт в запуске 124: STOP-слова типов/месяцев + PLACE_STOP/ADDR_STOP в abbrevWords).
// Ищем архивные карточки с БУДУЩЕЙ датой, у которых НЕТ ни одного живого близнеца
// по любому псевдониму названия на ту же дату и нет живой карточки с той же ссылкой источника.
// Такие строки — потерянные события (ложный архив), их надо вернуть в moderation.
//
// Запуск: node --env-file=.env scripts/dot-lost-archived-probe.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { norm, aliases, cityKey, overlap, samePlace } from './live-dupe-key.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);

const cols = 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,created_at,updated_at';
const archived = await selectAll(db, 'events', cols, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation', 'needs_changes']) });
console.log(`архивных с будущей датой: ${archived.length}; живых: ${live.length}; сегодня ${TODAY}`);

// индексы живых: по дате+названию (все псевдонимы) и по ссылке источника (канон)
const liveTitles = new Map(); // day|titleNorm -> [rows]
const liveSite = new Map();   // canon(website) -> [rows]
const liveDayCity = new Map(); // day|cityKey -> [rows]
const canon = (u) => {
  if (!u) return null;
  try { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return null; }
};
for (const r of live) {
  const day = (r.start_date || '').slice(0, 10);
  for (const a of aliases(r)) {
    const k = `${day}|${norm(a)}`;
    if (!liveTitles.has(k)) liveTitles.set(k, []);
    liveTitles.get(k).push(r);
  }
  const c = canon(r.website);
  if (c) { if (!liveSite.has(c)) liveSite.set(c, []); liveSite.get(c).push(r); }
  const k2 = `${day}|${cityKey(r)}`;
  if (!liveDayCity.has(k2)) liveDayCity.set(k2, []);
  liveDayCity.get(k2).push(r);
}

// мягкий признак «то же событие»: тот же день+город и >=3 общих значимых слова
const softTwin = (a) => {
  const cand = liveDayCity.get(`${(a.start_date || '').slice(0, 10)}|${cityKey(a)}`) || [];
  for (const b of cand) if (overlap(a, b) >= 3) return b;
  return null;
};

const orphan = [];
for (const a of archived) {
  const day = (a.start_date || '').slice(0, 10);
  let twin = null;
  for (const al of aliases(a)) {
    const hits = liveTitles.get(`${day}|${norm(al)}`) || [];
    if (hits.length) { twin = hits[0]; break; }
  }
  if (!twin) {
    const c = canon(a.website);
    const hits = c ? (liveSite.get(c) || []) : [];
    if (hits.length) twin = hits[0];
  }
  if (!twin) orphan.push(a);
}

// из «сирот» убираем объяснимые склейки: мягкий близнец (то же событие по словам) есть
const lost = [], explained = [];
for (const a of orphan) {
  const b = softTwin(a);
  if (b) explained.push({ a, b }); else lost.push(a);
}
console.log(`\nсирот ${orphan.length}: объяснимых склеек (мягкий близнец) ${explained.length}, БЕЗ ПРИЗНАКА БЛИЗНЕЦА ${lost.length}`);

const show = (r) => `«${(r.title_ru || r.title || '').slice(0, 55)}» ${(r.start_date || '').slice(0, 10)} ${r.start_time || ''} ${cityKey(r)} | ${r.website || '-'}`;
console.log(`\n=== НЕТ НИ БЛИЗНЕЦА ПО НАЗВАНИЮ/ССЫЛКЕ, НИ МЯГКОГО БЛИЗНЕЦА: ${lost.length}`);
const byDay = {};
for (const a of lost) { const d = (a.start_date || '').slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
console.log('по датам:', JSON.stringify(byDay));
const bySite = {};
for (const a of lost) { const c = canon(a.website) || '(нет сайта)'; bySite[c] = (bySite[c] || 0) + 1; }
console.log('топ сайтов:', Object.entries(bySite).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(', '));
for (const a of lost) console.log(`  arch ${a.id.slice(0, 8)} ${show(a)} | created ${(a.created_at || '').slice(0, 16)} upd ${(a.updated_at || '').slice(0, 16)} ${a.source_type}`);

if (!APPLY) { console.log('\nDRY RUN (вернуть в moderation: --apply)'); process.exit(0); }
const ids = lost.map((x) => x.id);
let done = 0;
for (let i = 0; i < ids.length; i += 50) {
  const part = ids.slice(i, i + 50);
  const { data, error } = await db.from('events').update({ status: 'moderation' }).in('id', part).select('id');
  if (error) { console.error('ошибка:', error.message); continue; }
  done += (data || []).length;
}
console.log(`возвращено в moderation: ${done}`);
