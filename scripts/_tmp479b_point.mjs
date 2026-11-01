// dot479b: у 228 архивных будущих карточек без близнеца по website/названию — есть ли живой двойник по точке+дате?
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cityKey, norm, hasCoords, distanceM, isCityLevelAddr, overlap } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);
const cols = 'id,title,title_ru,title_en,city,address,start_date,status,website,source_type,lat,lng,created_at';
const archived = await selectAll(db, 'events', cols, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation']) });
const liveSites = new Set(live.map((r) => r.website).filter(Boolean));
const liveTitleDay = new Set(live.map((r) => `${(r.start_date || '').slice(0, 10)}|${cityKey(r)}|${norm(r.title_ru || r.title).slice(0, 40)}`));

const lonely = archived.filter((a) => !(a.website && liveSites.has(a.website))
  && !liveTitleDay.has(`${(a.start_date || '').slice(0, 10)}|${cityKey(a)}|${norm(a.title_ru || a.title).slice(0, 40)}`));
console.log(`архив-будущее ${archived.length}, без близнеца ${lonely.length}`);

const byCityDay = new Map();
for (const r of live) {
  const k = `${(r.start_date || '').slice(0, 10)}|${cityKey(r)}`;
  if (!byCityDay.has(k)) byCityDay.set(k, []);
  byCityDay.get(k).push(r);
}

const sameEvent = [], sameDayOther = [], none = [];
for (const a of lonely) {
  const day = (a.start_date || '').slice(0, 10);
  const cands = [];
  for (const d of [day, ...shift(day)]) {
    for (const r of byCityDay.get(`${d}|${cityKey(a)}`) || []) {
      if (!hasCoords(a) || !hasCoords(r)) {
        if (norm(a.address) && norm(a.address) === norm(r.address) && norm(a.address).length > 3) cands.push([r, 'адрес=']);
        continue;
      }
      const dm = distanceM(a, r);
      if (dm <= 300) cands.push([r, `точка ${Math.round(dm)}м`]);
      else if (dm <= 4000 && (isCityLevelAddr(a) || isCityLevelAddr(r))) cands.push([r, `город-заглушка ${Math.round(dm)}м`]);
    }
  }
  if (cands.length) {
    const strong = cands.filter(([r, why]) => overlap(a, r) >= 2 || why.startsWith('точка'));
    if (strong.length) sameEvent.push([a, strong[0]]); else sameDayOther.push([a, cands[0]]);
  } else none.push(a);
}
function shift(day) {
  const out = [];
  for (const dt of [-1, 1]) {
    const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dt); out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
console.log(`\n=== ДВОЙНИК ПО ТОЧКЕ/АДРЕСУ (то же событие?) ${sameEvent.length}`);
for (const [a, [r, why]] of sameEvent) console.log(`  arch ${a.id.slice(0, 8)} ${a.start_date} «${(a.title_ru || a.title).slice(0, 45)}» <-> live ${r.id.slice(0, 8)} ${r.start_date} «${(r.title_ru || r.title).slice(0, 45)}» [${why}]`);
console.log(`\n=== ТО ЖЕ МЕСТО, ДРУГОЕ СОБЫТИЕ (слабые) ${sameDayOther.length}`);
for (const [a, [r, why]] of sameDayOther.slice(0, 15)) console.log(`  arch ${a.id.slice(0, 8)} ${a.start_date} «${(a.title_ru || a.title).slice(0, 40)}» ~ live «${(r.title_ru || r.title).slice(0, 40)}» [${why}]`);
console.log(`\n=== СОВСЕМ БЕЗ ПАРЫ ${none.length}`);
for (const a of none.slice(0, 20)) console.log(`  ${a.id.slice(0, 8)} ${a.start_date} ${a.city} «${(a.title_ru || a.title).slice(0, 50)}» ${a.website || '-'}`);
