// dot479: почему 154 архивные будущие карточки не имеют живого близнеца — потерянные события или законный архив?
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cityKey, norm } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const TODAY = new Date().toISOString().slice(0, 10);
const cols = 'id,title,title_ru,title_en,city,address,start_date,status,website,source_type,lat,lng,created_at';
const archived = await selectAll(db, 'events', cols, { filter: (q) => q.eq('status', 'archived').gte('start_date', TODAY) });
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation']) });
const liveSites = new Map();
for (const r of live) if (r.website) liveSites.set(r.website, r);
const liveKey = new Map();
for (const r of live) liveKey.set(`${(r.start_date || '').slice(0, 10)}|${cityKey(r)}|${norm(r.title_ru || r.title).slice(0, 40)}`, r);

const buckets = { sameSite: [], sameTitleDay: [], none: [] };
for (const a of archived) {
  const site = a.website && liveSites.get(a.website);
  if (site) { buckets.sameSite.push([a, site]); continue; }
  const k = `${(a.start_date || '').slice(0, 10)}|${cityKey(a)}|${norm(a.title_ru || a.title).slice(0, 40)}`;
  const t = liveKey.get(k);
  if (t) { buckets.sameTitleDay.push([a, t]); continue; }
  buckets.none.push(a);
}
console.log(`archived-future ${archived.length}; live ${live.length}`);
console.log(`по той же странице website: ${buckets.sameSite.length}`);
console.log(`то же название+день+город: ${buckets.sameTitleDay.length}`);
console.log(`БЕЗ ОБЪЯСНЕНИЯ: ${buckets.none.length}`);
for (const a of buckets.none) console.log(`  ${a.id.slice(0,8)} ${a.start_date} ${a.city} «${(a.title_ru || a.title).slice(0, 60)}» ${a.website || '-'}`);
