// Читающий дамп карточек по префиксу id (dot-events). node --env-file=.env scripts/dot-card-dump.mjs <prefix> [...]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const prefixes = process.argv.slice(2);
if (!prefixes.length) { console.error('Укажи префиксы id'); process.exit(1); }

const rows = await selectAll(db, 'events',
  'id,status,title,title_ru,city,address,start_date,start_time,end_date,end_time,lat,lng,website,source_type,recurrence,created_at');

for (const p of prefixes) {
  const hits = rows.filter(r => String(r.id).startsWith(p));
  if (!hits.length) { console.log(`[${p}] не найдено`); continue; }
  for (const r of hits) {
    console.log(`[${p}] ${r.id.slice(0, 8)} ${r.status} | ${r.title_ru || r.title} | ${r.city} | ${r.start_date} ${r.start_time || '--:--'}${r.end_date ? ' .. ' + r.end_date : ''} | ${r.lat ?? 'ГЕО=НЕТ'},${r.lng ?? ''} | адр=${r.address || 'АДРЕС=НЕТ'} | ${r.source_type} | created ${r.created_at} | ${r.website}`);
    if (r.recurrence) console.log(`    recurrence: ${JSON.stringify(r.recurrence)}`);
  }
}
