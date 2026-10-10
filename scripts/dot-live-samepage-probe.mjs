import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,status,start_date,start_time,city,address,website,source_type,created_at', {});
const LIVE = new Set(['active', 'moderation', 'needs_changes']);
const byUrl = new Map();
for (const r of rows) {
  if (!LIVE.has(r.status)) continue;
  const u = String(r.website || '').split('#')[0].replace(/\/$/, '');
  if (!u || u === 'null') continue;
  if (!byUrl.has(u)) byUrl.set(u, []);
  byUrl.get(u).push(r);
}
let groups = 0, cards = 0;
const out = [];
for (const [u, list] of byUrl) {
  if (list.length < 2) continue;
  groups++; cards += list.length;
  out.push(`${u}\n` + list.map(r => `   ${String(r.id).slice(0, 8)} [${r.status}] ${r.start_date} ${String(r.start_time || '--:--').slice(0, 5)} | ${String(r.title_ru || r.title).slice(0, 55)} | ${r.address || '—'} | создан ${String(r.created_at).slice(0, 16)}`).join('\n'));
}
console.log(out.join('\n'));
console.log(`\nЖИВЫХ ГРУПП «одна страница источника — больше одной живой карточки»: ${groups} (карточек ${cards})`);
