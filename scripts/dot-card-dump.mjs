// Дамп карточек по префиксам id (поля для сверки). Использование: node --env-file=.env scripts/dot-card-dump.mjs <префикс...>
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', '*');
const want = process.argv.slice(2).map((s) => s.toLowerCase());
for (const r of rows) {
  if (!want.some((w) => String(r.id).toLowerCase().startsWith(w))) continue;
  console.log('---', String(r.id).slice(0, 8), '|', r.status, '|', r.title);
  for (const [k, v] of Object.entries(r)) {
    if (['id', 'title'].includes(k)) continue;
    if (v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    console.log(`   ${k}: ${s.length > 200 ? s.slice(0, 200) + '…' : s}`);
  }
}
