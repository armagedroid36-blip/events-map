// dot479c: 36 «потерянных» архивных будущих карточек — группировка между собой (одно событие в двух источниках)
// и выбор одной карточки в восстановление. DRY по умолчанию, --apply восстанавливает archived -> moderation.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cityKey, norm, hasCoords, distanceM } from './live-dupe-key.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);
const cols = 'id,title,title_ru,title_en,city,address,start_date,status,website,source_type,lat,lng,description,photos,created_at';
const archived = await selectAll(db, 'events', cols, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation']) });
const liveSites = new Set(live.map((r) => r.website).filter(Boolean));
const liveTitleDay = new Set(live.map((r) => `${(r.start_date || '').slice(0, 10)}|${cityKey(r)}|${norm(r.title_ru || r.title).slice(0, 40)}`));
const lonely = archived.filter((a) => !(a.website && liveSites.has(a.website))
  && !liveTitleDay.has(`${(a.start_date || '').slice(0, 10)}|${cityKey(a)}|${norm(a.title_ru || a.title).slice(0, 40)}`));

// убрать уединённых, у кого есть живой сосед по точке/дате (класс 171 — архивные копии, законно)
const byCityDay = new Map();
for (const r of live) {
  for (const d of [r.start_date]) {
    const k = `${(d || '').slice(0, 10)}|${cityKey(r)}`;
    if (!byCityDay.has(k)) byCityDay.set(k, []);
    byCityDay.get(k).push(r);
  }
}
const shiftDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const alone = lonely.filter((a) => {
  for (const d of [a.start_date, shiftDays(a.start_date, -1), shiftDays(a.start_date, 1)]) {
    for (const r of byCityDay.get(`${d}|${cityKey(a)}`) || []) {
      if (hasCoords(a) && hasCoords(r) && distanceM(a, r) <= 300) return false;
      if (norm(a.address) && norm(a.address) === norm(r.address) && norm(a.address) > 3) return false;
    }
  }
  return true;
});
console.log(`архив-будущее ${archived.length}, уединённых ${alone.length}`);

// группировка уединённых между собой: та же дата (±0) и точка ≤300 м либо общий «корень» названия
const used = new Set(); const groups = [];
for (let i = 0; i < alone.length; i++) {
  if (used.has(i)) continue;
  const g = [alone[i]]; used.add(i);
  for (let j = i + 1; j < alone.length; j++) {
    if (used.has(j)) continue;
    const a = alone[i], b = alone[j];
    const sameDay = (a.start_date || '').slice(0, 10) === (b.start_date || '').slice(0, 10);
    const near = hasCoords(a) && hasCoords(b) && distanceM(a, b) <= 500;
    const wa = new Set(norm(a.title_ru || a.title).split(' ').filter((w) => w.length >= 5));
    const common = norm(b.title_ru || b.title).split(' ').filter((w) => w.length >= 5 && wa.has(w));
    if (sameDay && (near || common.length >= 2)) { g.push(b); used.add(j); }
  }
  groups.push(g);
}
const score = (r) => (r.description ? 1 : 0) + (Array.isArray(r.photos) && r.photos.length ? 1 : 0) + (r.lat && r.lng ? 1 : 0) + (r.source_type === 'collector' ? 1 : 0);
let toRestore = [];
for (const g of groups) {
  const sorted = [...g].sort((x, y) => score(y) - score(x));
  console.log(`\nГРУППА ${g.length}: ${g[0].start_date} ${g[0].city}`);
  for (const r of sorted) console.log(`  ${r.id.slice(0, 8)} score ${score(r)} «${(r.title_ru || r.title).slice(0, 55)}» desc ${(r.description || '').length} photos ${(r.photos || []).length} ${r.website || '-'}`);
  toRestore.push(sorted[0]);
}
console.log(`\nК восстановлению: ${toRestore.length}`);
if (!APPLY) { console.log('DRY (для применения: --apply)'); process.exit(0); }
for (const r of toRestore) {
  const { data, error } = await db.from('events').update({ status: 'moderation' }).eq('id', r.id).eq('status', 'archived').select('id,status,title');
  console.log(error ? `ОШИБКА ${r.id}: ${error.message}` : `restored ${data.length}: ${data[0]?.id.slice(0, 8)} ${data[0]?.status} «${(data[0]?.title || '').slice(0, 40)}»`);
}
