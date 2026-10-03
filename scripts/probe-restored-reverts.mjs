// Кто снова заархивировал e086a01c и edb5fbd6 — ищем все строки с теми же названиями/ссылками.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id, title, title_ru, title_en, city, status, start_date, end_date, website, created_at, source_type, recurrence');
const norm = (s) => (s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();

for (const id of ['e086a01c', 'edb5fbd6']) {
  const r = rows.find((x) => x.id.startsWith(id));
  if (!r) { console.log(id, 'не найден'); continue; }
  console.log(`\n== ${id} | ${r.status} | ${r.start_date} -> ${r.end_date || '(нет)'} | rec=${JSON.stringify(r.recurrence)} | ${r.source_type || '-'} | ${r.city} | сайт: ${r.website || '-'} | создано: ${r.created_at}`);
  console.log(`   title="${r.title}" ru="${r.title_ru}" en="${r.title_en}"`);
  const titles = new Set([norm(r.title), norm(r.title_ru), norm(r.title_en)].filter(Boolean));
  const kin = rows.filter((o) => {
    if (o.id === r.id) return false;
    const sameSite = r.website && o.website && o.website === r.website;
    const ot = [norm(o.title), norm(o.title_ru), norm(o.title_en)].filter(Boolean);
    return sameSite || ot.some((t) => titles.has(t));
  });
  for (const o of kin) console.log(`   родня: ${o.status} | ${o.start_date} | ${o.id.slice(0, 8)} | ${o.city} | ${o.website || '-'} | ${(o.title_ru || o.title || '').slice(0, 40)} | создано ${o.created_at}`);
  if (!kin.length) console.log('   родни нет вообще');
}
