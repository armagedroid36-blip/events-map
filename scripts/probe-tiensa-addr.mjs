// probe: состояние карточки Tiên Sa Show + поиск похожих записей
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { data, error } = await db.from('events')
  .select('id,title,title_ru,status,start_date,end_date,address,city,lat,lng,website,source_type,auto_review,category')
  .or('id.eq.e92095ff,id.eq.f7b0f38c').limit(5);
if (error) console.log('ERR', error.message);
for (const e of data || []) console.log(JSON.stringify(e));
// другие записи про Тьен Са
const { data: t } = await db.from('events').select('id,title,title_ru,status,start_date,address,city,lat,lng,website').ilike('title', '%Tiên Sa%').limit(20);
console.log('--- Tiên Sa rows:', (t || []).length);
for (const e of t || []) console.log(JSON.stringify(e));
const { data: t2 } = await db.from('events').select('id,title,title_ru,status,start_date,address,city,lat,lng').ilike('title', '%Trưng Vương%').limit(10);
console.log('--- Trung Vuong rows:', (t2 || []).length);
for (const e of t2 || []) console.log(JSON.stringify(e));
