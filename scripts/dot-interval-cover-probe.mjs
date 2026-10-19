// Живой замер класса: сколько ЖИВЫХ карточек база считает копиями по правилу
// «многодневная карточка накрывает дату» (норма 0 — класс закрыт правкой 330).
// Запуск: node --env-file=.env scripts/dot-interval-cover-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { buildIntervalIndex, coveredByInterval } from './interval-cover.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROLE;
const db = createClient(url, key);

const rows = await selectAll(db, 'events', 'id, title, title_ru, city, start_date, end_date, status, website');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const index = buildIntervalIndex(rows);
const intervals = live.filter((r) => {
  const a = Date.parse(r.start_date); const b = Date.parse(r.end_date);
  return r.end_date && b - a >= 2 * 86400000 && b - a <= 60 * 86400000;
});
const cands = live.filter((r) => coveredByInterval(index, r));
console.log(`всего строк ${rows.length}, живых ${live.length}, карточек с интервалом 2..60 дней ${intervals.length}`);
console.log(`кандидатов «копия внутри интервала»: ${cands.length}`);
for (const c of cands.slice(0, 20)) console.log(`  ${c.id.slice(0, 8)} ${c.status} ${c.start_date} ${c.city} — ${c.title.slice(0, 60)}`);
