import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,start_date,status');
const g = {};
for (const r of rows) { const a=(r.address||'').trim(); if(!a) continue; (g[a]=g[a]||[]).push(r); }
for (const [a,list] of Object.entries(g)) if (list.length>1 && /Pattihio|Tennis Club/i.test(a)) {
  console.log('---', a, list.length);
  for (const r of list) console.log('   ', r.id.slice(0,8), r.status, r.city, r.lat, r.lng, r.start_date, (r.title||'').slice(0,50));
}
