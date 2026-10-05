// Временная читающая проба: три active-карточки Race for the Cure 01.11 + пара Murder.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,start_date,start_time,end_date,city,address,lat,lng,website,status,source_type,created_at,recurrence');
const IDS = ['04f731ea', 'c8db8664', 'cd50ee20', '633a31c7', 'd70a20df', '287f1564', 'd6d536c7'];
for (const id of IDS) {
  const r = rows.find((x) => x.id.startsWith(id));
  if (!r) { console.log(id, 'НЕ НАЙДЕН'); continue; }
  console.log(`\n== ${r.id.slice(0, 8)} [${r.status}] ${r.source_type} | ${r.start_date} ${r.start_time || '--'}${r.end_date ? ' -> ' + r.end_date : ''}${r.end_time ? ' ' + r.end_time : ''}`);
  console.log(`   city=${r.city} | addr=${r.address} | geo=${r.lat},${r.lng}`);
  console.log(`   rec=${r.recurrence ? JSON.stringify(r.recurrence).slice(0, 70) : '-'} | created=${r.created_at}`);
  console.log(`   url=${r.website}`);
  console.log(`   RU=${(r.title_ru || '-').slice(0, 70)} | EN=${(r.title_en || '-').slice(0, 70)}`);
}
