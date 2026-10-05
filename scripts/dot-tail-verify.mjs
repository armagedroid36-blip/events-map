// Временная проверка хвоста архивации: серийные active, active с прошедшей датой, счётчики.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,start_date,end_date,recurrence,city,title');

const by = {};
for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
console.log('СТАТУСЫ', JSON.stringify(by));

const today = new Date().toISOString().slice(0, 10);
const active = rows.filter((r) => r.status === 'active');
const rec = active.filter((r) => r.recurrence && (r.recurrence.freq || r.recurrence.rule));
console.log('active с правилом повтора:', rec.length);
for (const r of rec.slice(0, 20)) console.log('  rec', r.id.slice(0, 8), r.start_date, r.city, (r.title || '').slice(0, 40));

const past = active.filter((r) => (r.end_date || r.start_date) < today);
console.log('active с прошедшей датой (end_date||start_date < today):', past.length);
for (const r of past.slice(0, 25)) console.log('  past', r.id.slice(0, 8), r.start_date, '->', r.end_date, r.city, (r.title || '').slice(0, 40), 'rec=', r.recurrence ? 'да' : 'нет');
