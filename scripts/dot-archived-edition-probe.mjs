// Постоянный зонд класса «издание серии срезано правилом интервала» (норма 0).
// Запуск: node --env-file=.env scripts/dot-archived-edition-probe.mjs
// Ручки: PROBE_STATUS=archived (по умолчанию), PROBE_LIMIT.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { findLostEditions } from './archived-editions.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROLE;
const db = createClient(url, key);

const rows = await selectAll(db, 'events', 'id, title, title_ru, title_en, city, start_date, end_date, status, website');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const lost = findLostEditions(rows);
const limit = Number(process.env.PROBE_LIMIT) || 20;

console.log(`всего строк ${rows.length}, живых ${live.length}, архивных ${rows.length - live.length}`);
console.log(`изданий, потерянных из-за правила интервала: ${lost.length}`);
for (const { row, cover } of lost.slice(0, limit)) {
  console.log(`  ${row.id.slice(0, 8)} ${row.start_date}→${row.end_date} ${row.city} — ${row.title.slice(0, 55)}`);
  if (cover) console.log(`      накрыт живым: ${cover.id.slice(0, 8)} ${cover.start_date}→${cover.end_date} ${cover.title.slice(0, 45)}`);
}
if (!lost.length) console.log('НОРМА 0 — ok');
