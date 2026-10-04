// Ремонт класса «живые дубли с аббревиатурой в названии» (S.V.E.T./С.В.Е.Т. и т.п.).
// Логика детектора — в dot-abbrev-dupe-scan.mjs (только чтение). Здесь отбираются
// ТОЛЬКО точные сигналы: «аббрев-слов 3+ (имя)» и «аббрев-слов 2 + адрес~», плюс
// обязательная проверка места (общий значимый токен адреса ИЛИ координаты <=1 км) —
// чтобы не склеить разные деревни/площадки с похожими фестивальными названиями.
// Keeper — как в dot-live-dupe-fix.mjs (фото/описание/EN/не заглушка, затем старше created_at).
// Запуск: node --env-file=.env scripts/dot-abbrev-dupe-fix.mjs          # сухой прогон
//         node --env-file=.env scripts/dot-abbrev-dupe-fix.mjs --apply  # ремонт в archived
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { liveDupeMatch, liveAbbrevMatch, cityKey, norm, isCityLevelAddr } from './live-dupe-key.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,lat,lng,status,website,source_type,photos,description_ru,description_en,created_at');
const live = all.filter((r) => r.status === 'active');

// Логика пары — в scripts/live-dupe-key.mjs (liveAbbrevMatch); тот же ключ работает
// штатным правилом 4б в scripts/dedupe-events.mjs. Здесь только отбор и ремонт.
const match = (a, b) => (liveDupeMatch(a, b) ? null : liveAbbrevMatch(a, b));

const groups = new Map();
for (const r of live) {
  const k = `${(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const parent = new Map();
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
for (const r of live) parent.set(r.id, r.id);
const pairs = [];
for (const [, g] of groups) {
  if (g.length < 2) continue;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    if (liveDupeMatch(a, b)) continue;
    const why = match(a, b);
    if (why) { pairs.push({ a, b, why }); union(a.id, b.id); }
  }
}
const clusters = new Map();
for (const r of live) { const root = find(r.id); if (!clusters.has(root)) clusters.set(root, []); clusters.get(root).push(r); }
const drows = [...clusters.values()].filter((g) => g.length > 1);
const score = (r) => (Array.isArray(r.photos) && r.photos.length ? 2 : 0) + (r.description_ru ? 1 : 0) + (r.description_en ? 1 : 0) + (r.title_en ? 1 : 0) + (isCityLevelAddr(r) ? 0 : 2);
const losers = [];
console.log(`ACTIVE ${live.length}; пар ${pairs.length}; групп ${drows.length}`);
for (const g of drows) {
  const sorted = [...g].sort((a, b) => (score(b) - score(a)) || String(a.created_at).localeCompare(String(b.created_at)));
  const keep = sorted[0];
  const why = [...new Set(pairs.filter((p) => g.includes(p.a) && g.includes(p.b)).map((p) => p.why))].join(' / ');
  console.log(`--- ${keep.start_date?.slice(0, 10)} ${cityKey(keep)} (${g.length}) [${why}] keeper ${keep.id.slice(0, 8)} «${(keep.title_ru || keep.title).slice(0, 45)}»`);
  for (const l of sorted.slice(1)) { losers.push(l.id); console.log(`      архив ${l.id.slice(0, 8)} «${(l.title_ru || l.title).slice(0, 45)}» | ${norm(l.address).slice(0, 30)}`); }
}
console.log(`к архивации: ${losers.length}`);
if (!APPLY) { console.log('DRY RUN (для ремонта: --apply)'); process.exit(0); }
let done = 0;
for (let i = 0; i < losers.length; i += 50) {
  const { error } = await db.from('events').update({ status: 'archived' }).in('id', losers.slice(i, i + 50));
  if (error) { console.error('ошибка:', error.message); continue; }
  done += losers.slice(i, i + 50).length;
}
console.log(`заархивировано: ${done}`);
