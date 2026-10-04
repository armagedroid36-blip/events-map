// Точка «События»: разбор карточки 29206756 (Once Show, VinWonders). Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,description,city,address,lat,lng,status,start_date,start_time,source_type,website,created_at');
const target = process.argv[2] || '29206756';
const hits = rows.filter(r => (r.id || '').startsWith(target) || JSON.stringify(r).toLowerCase().includes('vinwonders'));
for (const h of hits) console.log(JSON.stringify(h, null, 1));
console.log('всего строк:', rows.length, 'совпадений:', hits.length);
