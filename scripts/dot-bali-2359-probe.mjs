// Пробa: карточка 0aa2dbf4 (start_time 23:59) vs лента Балифорума.
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,start_time,end_date,end_time,status,website');
const rows = all.filter((r) => String(r.id).startsWith('0aa2dbf4'));
if (!rows.length) console.log('карточка не найдена');
for (const r of rows) console.log('CARD', JSON.stringify(r));

function feed(page) {
  const out = execSync(
    `curl -s -x http://127.0.0.1:10809 --max-time 20 "https://baliforum.ru/api/v1/events?defaultList=1&page=${page}"`,
    { maxBuffer: 1 << 28 },
  );
  return JSON.parse(out.toString('utf8'));
}
const needles = ['преподавател', 'йоги', 'yoga'];
for (let page = 1; page <= 4; page++) {
  let d;
  try { d = feed(page); } catch (e) { console.log('FEED ERR p' + page, e.message.slice(0, 120)); break; }
  const evs = d.data || [];
  if (!evs.length) { console.log('page', page, 'пусто'); break; }
  for (const e of evs) {
    const t = (e.title || '').toLowerCase();
    if (!needles.some((n) => t.includes(n))) continue;
    const ds = (e.eventDates || []).map((x) => `${String(x.startAt).slice(0, 16)}→${x.endAt ? String(x.endAt).slice(0, 16) : 'null'}`);
    console.log(`\nFEED p${page} | ${e.title} | slug ${e.slug}`);
    console.log('  дат', ds.length, ':', ds.slice(0, 10).join(' | '));
    console.log('  слаг/ссылка:', e.url || e.link || '');
  }
}
