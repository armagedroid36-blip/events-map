// Разведка: карточка по префиксу id (uuid, поэтому фильтр в JS) + поиск площадки в ленте Cyprus Now
// node --env-file=.env scripts/dot-cy-sotira-probe.mjs <префикс-id> "<термин CN>" ...
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const PR = process.argv[2] || '369135b1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,title,start_date,start_time,city,address,lat,lng,status,source_type,website,auto_review');
for (const r of rows.filter((x) => String(x.id).startsWith(PR))) console.log(JSON.stringify(r));

const terms = process.argv.slice(3);
for (const t of terms) {
  try {
    const r = await fetch('https://cyprusnow.app/api/events?q=' + encodeURIComponent(t), { signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    const evs = j.events || [];
    console.log('--- q=' + t + ' -> ' + evs.length + ' событий');
    for (const e of evs.slice(0, 10)) {
      console.log('   ', e.title, '|', e.venue?.name, '|', e.venue?.city, '|', e.venue?.lat, e.venue?.lng, '|', e.startDate || e.start_date);
    }
  } catch (err) {
    console.log('--- q=' + t + ' ОШИБКА: ' + err.message);
  }
}
