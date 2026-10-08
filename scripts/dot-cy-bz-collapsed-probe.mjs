// dot-cy-bz-collapsed-probe.mjs — читающий зонд: сколько ЖИВЫХ карточек cyprus.bz
// делят пару (start_date, city) с другой живой cyprus.bz-карточкой — кандидаты на
// «источник слил страницы» (301 одной страницы на другую), как пара 36cb → 349f (run 104).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = (await selectAll(db, 'events', 'id,title,start_date,city,website,status'))
  .filter((r) => (r.status === 'active' || r.status === 'moderation') && /cyprus\.bz\/event\//.test(r.website || ''));
const groups = new Map();
for (const r of rows) {
  const k = `${r.start_date}|${r.city}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const pairs = [...groups.entries()].filter(([, v]) => v.length > 1);
console.log(`живых карточек cyprus.bz: ${rows.length}; групп (дата|город) с 2+ карточками: ${pairs.length}`);
for (const [k, v] of pairs) {
  console.log(`\n${k} — ${v.length}`);
  for (const r of v) console.log(`   ${r.id.slice(0, 8)} | ${String(r.title).slice(0, 58)} | ${(r.website || '').replace('https://cyprus.bz/event/', '')}`);
}
