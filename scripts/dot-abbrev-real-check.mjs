// Проверка: аббревиатурный ключ (liveAbbrevMatch) ловит реальную пару S.V.E.T.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { liveAbbrevMatch, liveDupeMatch, abbrevOverlap, sameAbbrev, cityKey, dayKey, norm } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,lat,lng,status');
const ids = ['4601355d', 'cb780667', 'a2740503', '57a46904'];
const rows = all.filter((r) => ids.some((p) => r.id.startsWith(p)));
for (const r of rows) console.log(r.id.slice(0, 8), r.status, '|', r.start_date + ' ' + String(r.start_time||'').slice(0,5) + ' | ' + cityKey(r), '|', (r.title_ru || r.title || '').slice(0, 40), '|', norm(r.address).slice(0, 35));
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  const a = rows[i], b = rows[j];
  console.log(`${a.id.slice(0, 8)} <-> ${b.id.slice(0, 8)}: ov=${abbrevOverlap(a, b)} strict=${liveDupeMatch(a, b)} abbrev=${liveAbbrevMatch(a, b)}`);
}
