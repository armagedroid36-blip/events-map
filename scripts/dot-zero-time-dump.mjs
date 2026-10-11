// Читающий зонд: живые карточки с временем-заглушкой 00:00 (start_time 00:00, начало не в прошлом).
// Печатает JSON для последующей сверки со страницей источника.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { writeFileSync } from 'node:fs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,start_date,start_time,end_date,end_time,status,website,source_type,created_at');
const today = new Date().toISOString().slice(0, 10);
const out = rows.filter((r) => ['active', 'moderation'].includes(r.status)
  && r.start_time === '00:00:00' && r.start_date >= today);
out.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
for (const r of out) {
  console.log([r.id.slice(0, 8), r.start_date, r.end_date || '-', r.city, (r.website || '-'), (r.title_ru || r.title || '').slice(0, 45)].join(' | '));
}
console.log('ИТОГО карточек 00:00:', out.length, 'живых всего:', rows.filter((r) => ['active', 'moderation'].includes(r.status)).length);
writeFileSync(process.env.TEMP + '/zero-time.json', JSON.stringify(out, null, 1));
