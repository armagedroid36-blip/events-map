import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,start_time,status,website,source_type');
const P = ['0342fad2','a593accd','eeb244ff','ec507855','be700101'];
for (const r of rows) if (P.some(p=>r.id.startsWith(p))) console.log(JSON.stringify(r));
