// Поиск по базе (любой статус) карточек, чьё название содержит термин.
// Запуск: node --env-file=.env scripts/dot-token-probe.mjs <термин> [<термин>...]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { norm } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,status,start_date,start_time,end_date,city,address,website,source_type,created_at,updated_at');
const terms = process.argv.slice(2).map((t) => norm(t));
for (const t of terms) {
  console.log(`\n=== «${t}»`);
  const hits = rows.filter((r) => [r.title, r.title_ru, r.title_en].some((s) => s && norm(s).includes(t)));
  for (const r of hits.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))) {
    console.log(`  ${String(r.id).slice(0, 8)} ${r.status.padEnd(13)} ${(r.start_date || '').slice(0, 10)} ${r.start_time || ''} ${(r.end_date || '').slice(0, 10)} ${(r.city || '').padEnd(14)} «${(r.title_ru || r.title || '').slice(0, 60)}» | ${r.website || '-'}`);
  }
  if (!hits.length) console.log('  (нет)');
}
