// Читающий зонд: 3 театральные карточки без start_time — печатает их website/адрес/описание.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,website,address,start_date,start_time,description,status,source_type');
const ids = ['4df7da34', 'c941dccf', 'd87e2814'];
for (const r of rows.filter((x) => ids.includes(x.id.slice(0, 8)))) {
  console.log('---', r.id, r.status, r.title, '|', r.city, '|', r.start_date, '| start_time:', r.start_time);
  console.log('website:', r.website);
  console.log('address:', r.address);
}
