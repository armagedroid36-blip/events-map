import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const IDS = ['05c07b5e', '5abadaf6', '633a31c7', 'd70a20df', '04f731ea', 'cd50ee20', 'be61af07', 'c918d845', '287f1564', 'd6d536c7'];
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,status,start_date,start_time,city,address,lat,lng,website,source_type', {});
for (const r of rows) {
  const p = String(r.id).slice(0, 8);
  if (!IDS.includes(p)) continue;
  console.log(`${p} [${r.status}] ${r.start_date} ${r.start_time || '--:--'} ${r.city} | адрес: ${r.address || '—'} | гео: ${r.lat ?? '—'},${r.lng ?? '—'} | ${String(r.website || '—').slice(0, 70)}`);
  console.log(`     RU: ${String(r.title_ru || '—').slice(0, 70)}`);
  console.log(`     EN: ${String(r.title_en || '—').slice(0, 70)}`);
  console.log(`     O : ${String(r.title).slice(0, 70)}`);
}
