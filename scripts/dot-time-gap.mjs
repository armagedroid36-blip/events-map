// Срез active-карточек без времени + общий снимок базы.
// Запуск из корня репозитория: node --env-file=.env scripts/dot-time-gap.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const rows = await selectAll(
  db,
  'events',
  'id,status,title,start_date,start_time,end_time,end_date,city,address,lat,lng,source_type,website,created_at',
);
const act = rows.filter((r) => r.status === 'active');
const empty = (v) => v === null || v === undefined || v === '';
console.log('events', rows.length, '| active', act.length);
const st = {};
for (const r of rows) st[r.status] = (st[r.status] || 0) + 1;
console.log('статусы', JSON.stringify(st));

const noTime = act.filter((r) => empty(r.start_time));
console.log('active без start_time:', noTime.length);
for (const r of noTime) {
  console.log(
    ' ',
    r.id.slice(0, 8),
    r.start_date,
    r.city,
    '|',
    (r.source_type || '') + '|',
    (r.address || 'нет адреса').slice(0, 50),
    '|',
    (r.website || 'нет сайта').slice(0, 75),
    '|',
    (r.title || '').slice(0, 45),
  );
}
