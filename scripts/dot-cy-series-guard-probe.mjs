// Живые карточки по фрагментам названия + сверка с лентой Cyprus Now (серии).
// Использование: node --env-file=.env scripts/dot-cy-series-guard-probe.mjs <фрагмент> [<фрагмент>...]
// Печатает: живые карточки группы и, для ленты источника, series_count/series_first/series_last
// по каждому городу — чтобы отличить «одно многодневное событие» от серии отдельных вечеров.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFileSync } from 'node:child_process';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', '*');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
console.log('всего строк', rows.length, '| живых', live.length);

const pats = process.argv.slice(2).map((s) => s.toLowerCase());
for (const p of pats) {
  const g = live.filter((r) => `${r.title || ''}${r.title_ru || ''}${r.title_en || ''}`.toLowerCase().includes(p));
  console.log(`\n=== ${p}: живых ${g.length}`);
  for (const r of g)
    console.log(
      [String(r.id).slice(0, 8), r.status, r.start_date, r.start_time || '-', r.end_date || '-', r.city || '-',
       (r.title || '').slice(0, 50), (r.address || '-').slice(0, 34), r.lat, r.lng, String(r.website || '-').slice(-45)].join(' | '),
    );
  if (!g.length) continue;
  const q = encodeURIComponent(g[0].title || p);
  let raw = '';
  try {
    raw = execFileSync('curl', ['-s', '--max-time', '25', '-x', 'http://127.0.0.1:10809',
      `https://cyprusnow.app/api/events?q=${q}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } catch (e) {
    console.log('   источник недоступен:', e.message);
    continue;
  }
  let ev = [];
  try { ev = JSON.parse(raw).events || []; } catch { console.log('   ответ не JSON'); continue; }
  console.log('   лента источника: записей ' + ev.length);
  for (const e of ev)
    console.log(`   src ${e.slug} | ${e.start_at} -> ${e.end_at} | ${e.venue_name} | series_count=${e.series_count} first=${e.series_first} last=${e.series_last}`);
}
