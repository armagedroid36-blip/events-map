// Печать заданных карточек: id, статус, дата/время, город, адрес, website, источник, создано.
// Запуск: node --env-file=.env scripts/dot-show-ids.mjs id1 id2 ...
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const ids = process.argv.slice(2).filter((a) => /^[0-9a-f]{8,}$/i.test(a));
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,status,website,source_type,lat,lng,photos,created_at');
for (const id of ids) {
  const r = rows.find((x) => x.id.startsWith(id));
  if (!r) { console.log(`${id}: не найдено`); continue; }
  console.log(`${r.id.slice(0, 8)} ${r.status.padEnd(10)} ${String(r.start_date).slice(0, 10)} ${r.start_time || '--:--'} ${cityKeyShow(r)}`);
  console.log(`   ru: ${r.title_ru || '-'}\n   orig: ${r.title}\n   en: ${r.title_en || '-'}`);
  console.log(`   адрес: ${r.address || '-'} | коорд: ${r.lat},${r.lng} | фото ${(r.photos || []).length} | ${r.source_type} | ${r.website}`);
  console.log(`   создано: ${r.created_at}`);
}
function cityKeyShow(r) { return r.city; }
