// читающий зонд: карточки тура «Μια νύκτα στον παράδεισο» в базе
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const pats = ['%παράδεισο%', '%парадиз%', '%paradise%', '%παραδεισ%'];
const rows = [];
for (const p of pats) {
  const { data, error } = await db.from('events')
    .select('id,title,title_ru,city,address,start_date,end_date,start_time,end_time,status,website,source_type')
    .or(`title.ilike.${p},title_ru.ilike.${p},title_en.ilike.${p}`)
    .limit(100);
  if (error) { console.log('ERR', p, error.message); continue; }
  for (const r of data) if (!rows.find(x => x.id === r.id)) rows.push(r);
}
console.log('строк:', rows.length);
for (const r of rows.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))) {
  console.log([r.id.slice(0, 8), r.status, r.start_date, '->', r.end_date, r.start_time, r.city, (r.title_ru || r.title || '').slice(0, 45), (r.website || '').slice(0, 60)].join(' | '));
}
