// Срез новых строк за окно: поля для контроля качества
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const SINCE = process.argv[2];
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,start_time,status,website,source_type,created_at');
const rows = all.filter((r) => r.created_at >= SINCE).sort((a, b) => a.created_at.localeCompare(b.created_at));
const total = all.length;
const act = all.filter((r) => r.status === 'active').length;
const mod = all.filter((r) => r.status === 'moderation').length;
console.log(`ВСЕГО events ${total} | active ${act} | moderation ${mod}`);
for (const r of rows) {
  console.log([r.created_at, r.id.slice(0, 8), r.status, r.city, r.start_date, r.start_time || '(нет времени)',
    r.lat == null ? 'ГЕО=НЕТ' : `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`, r.address ? 'адр=' + r.address.slice(0, 50) : 'АДРЕС=НЕТ',
    (r.title_ru || r.title || '').slice(0, 40), r.website || ''].join(' | '));
}
