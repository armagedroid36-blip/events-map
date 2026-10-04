// Проверка website-повторов среди новых карточек: серия (разные даты) или дубль (одна дата).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,status,website,created_at');
const SINCE = process.argv[2];
const newRows = all.filter((r) => r.created_at >= SINCE && r.website);
for (const r of newRows) {
  const grp = all.filter((x) => x.website === r.website);
  const byDate = {};
  for (const x of grp) byDate[x.start_date] = (byDate[x.start_date] || 0) + 1;
  const live = grp.filter((x) => ['active', 'moderation', 'needs_changes'].includes(x.status));
  const liveDates = {}; for (const x of live) liveDates[x.start_date] = (liveDates[x.start_date] || 0) + 1;
  const clash = Object.entries(liveDates).filter(([, n]) => n > 1);
  console.log(`${(r.title_ru || r.title || '').slice(0, 38)} | строк по website ${grp.length} | дат ${Object.keys(byDate).length} | живых ${live.length} | ОДНА ДАТА ДВАЖДЫ: ${clash.length ? JSON.stringify(clash) : 'нет'}`);
}
