// dot-cy-bz-urls-probe.mjs — читающий: есть ли в базе карточки с указанными
// путями страниц cyprus.bz (кандидаты-«канон» для страниц, которые отдают 301).
// Запуск: node --env-file=.env scripts/dot-cy-bz-urls-probe.mjs <slug-prefix...>
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const needles = process.argv.slice(2);
const rows = await selectAll(db, 'events', 'id,title,start_date,city,website,status');
for (const n of needles) {
  const hits = rows.filter((r) => (r.website || '').includes(`cyprus.bz/event/${n}`));
  console.log(`\n${n}: ${hits.length}`);
  for (const r of hits) console.log(`   ${r.id.slice(0, 8)} | ${r.status} | ${r.start_date} | ${r.city} | ${String(r.title).slice(0, 60)}`);
}
