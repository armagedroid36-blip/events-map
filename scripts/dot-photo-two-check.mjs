import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const IDS = ['9c9a2952', 'dd59c1c2'];
const rows = await selectAll(db, 'events', 'id,title,title_ru,status,city,start_date,start_time,address,lat,lng,photos,website', {});
for (const r of rows) {
  const p = String(r.id).slice(0, 8);
  if (!IDS.includes(p)) continue;
  console.log(`${p} [${r.status}] ${r.start_date} ${String(r.start_time || '').slice(0, 5)} ${r.city} | ${String(r.title_ru || r.title).slice(0, 50)}`);
  console.log(`   адрес: ${r.address || '—'} | гео ${r.lat},${r.lng}`);
  console.log(`   photos: ${JSON.stringify(r.photos)}`);
  console.log(`   site: ${r.website}`);
}
