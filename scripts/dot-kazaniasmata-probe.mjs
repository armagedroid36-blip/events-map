import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,status,start_date,start_time,end_date,city,address,lat,lng,website,source_type,photos,created_at', {});
const needle = /kazanias|καζαν|arsos|αρσος/i;
let n = 0;
for (const r of rows) {
  const blob = [r.title, r.title_ru, r.title_en, r.address, r.website].filter(Boolean).join(' | ');
  if (!needle.test(blob)) continue;
  n++;
  const p = String(r.id).slice(0, 8);
  console.log(`${p} [${r.status}] ${r.start_date} ${r.start_time || '--:--'} -> ${r.end_date || '—'} | ${r.city} | ${r.source_type}`);
  console.log(`   RU: ${String(r.title_ru || '—').slice(0, 80)}`);
  console.log(`   O : ${String(r.title).slice(0, 80)}`);
  console.log(`   адрес: ${r.address || '—'} | гео: ${r.lat ?? '—'},${r.lng ?? '—'} | фото ${(r.photos || []).length}`);
  console.log(`   site: ${r.website || '—'} | created ${r.created_at}`);
}
console.log(`всего совпадений: ${n}`);
