// Разовая разведка: карточки-близнецы Tiên Sa Show (Дананг) — e92095ff / f7b0f38c
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function findByPrefix(p) {
  const { data, error } = await db
    .from('events')
    .select('*')
    .gte('id', `${p}-0000-0000-0000-000000000000`)
    .lte('id', `${p}-ffff-ffff-ffff-ffffffffffff`);
  if (error) throw new Error(error.message);
  return data;
}

const rows = [...(await findByPrefix('e92095ff')), ...(await findByPrefix('f7b0f38c'))];
console.log('найдено строк:', rows.length);
const SHOW = ['id', 'title', 'title_ru', 'title_en', 'status', 'source_type', 'start_date', 'end_date', 'start_time', 'end_time', 'city', 'address', 'place', 'venue_name', 'website', 'latitude', 'longitude', 'auto_review', 'created_at', 'updated_at'];
for (const r of rows) {
  console.log('---');
  for (const k of SHOW) if (k in r) console.log(' ', k, '=', JSON.stringify(r[k]));
  const extra = Object.keys(r).filter((k) => !SHOW.includes(k));
  for (const k of extra) {
    const v = JSON.stringify(r[k]);
    if (v && v !== 'null' && v !== '""' && v !== '[]' && v !== '{}') console.log('  *', k, '=', v.slice(0, 200));
  }
}

const { data: same, error: e2 } = await db
  .from('events')
  .select('id,status,start_date,city,title,title_ru,title_en,website')
  .or('title.ilike.%Tien Sa%,title_en.ilike.%Tien Sa%,title_ru.ilike.%Tien Sa%,title.ilike.%Tiên Sa%');
if (e2) console.log('поиск по названию: ошибка', e2.message);
else {
  console.log('=== карточки Tiên Sa:', same.length);
  for (const r of same) console.log(r.id, '|', r.status, '|', r.start_date, '|', r.city, '|', (r.title_ru || r.title || r.title_en || '').slice(0, 60));
}
