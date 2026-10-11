// Читающий зонд: живые карточки с временем ОКОНЧАНИЯ-заглушкой 00:00
// (end_time 00:00:00). Печатает JSON для сверки со страницей источника.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { writeFileSync } from 'node:fs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,start_date,start_time,end_date,end_time,status,website,source_type,created_at,lat,lng');
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const out = live.filter((r) => r.end_time === '00:00:00');
out.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
for (const r of out) {
  console.log([r.id.slice(0, 8), r.start_date, r.start_time, '->', r.end_date, r.end_time,
    r.end_date === r.start_date ? 'ОДИН ДЕНЬ' : 'диапазон', r.city, (r.website || '-'),
    (r.title_ru || r.title || '').slice(0, 40)].join(' | '));
}
const oneDay = out.filter((r) => r.end_date === r.start_date);
console.log('ИТОГО end_time 00:00:', out.length, 'из них end_date=start_date:', oneDay.length, 'живых всего:', live.length);
writeFileSync(process.env.TEMP + '/endtime-zero.json', JSON.stringify(out, null, 1));
