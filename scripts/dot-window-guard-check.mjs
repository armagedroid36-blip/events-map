// Окно новых строк: контроль guard'а end_time (правка 168) + фолбэк-пины
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const SINCE = process.argv[2];
const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,start_time,end_date,end_time,status,website,source_type,created_at');
const rows = all.filter((r) => r.created_at >= SINCE).sort((a, b) => a.created_at.localeCompare(b.created_at));
console.log(`ВСЕГО ${all.length} | active ${all.filter((r) => r.status === 'active').length} | moderation ${all.filter((r) => r.status === 'moderation').length} | новых с ${SINCE}: ${rows.length}`);

const FALL = {
  'Лимасол': [34.7071, 33.0226], 'Никосия': [35.1856, 33.3823], 'Ларнака': [34.9182, 33.6194],
  'Пафос': [34.7754, 32.4245], 'Фамагуста': [35.1205, 33.9432], 'Бали': [-8.4095, 115.1889],
};
let guardBad = 0, fb = 0, noGeo = 0, noAddr = 0;
for (const r of rows) {
  const st = (r.start_time || '').slice(0, 5), et = (r.end_time || '').slice(0, 5);
  const same = r.end_date && r.start_date && r.end_date === r.start_date;
  const g = same && et && et <= st;
  if (g) { guardBad++; console.log(`  GUARD-НАРУШЕНИЕ ${r.id.slice(0, 8)} ${r.city} ${r.start_date} ${st}->${et} ${(r.title_ru || r.title || '').slice(0, 40)}`); }
  if (r.lat == null) { noGeo++; console.log(`  ГЕО=НЕТ ${r.id.slice(0, 8)} ${r.city} ${(r.title_ru || r.title || '').slice(0, 40)}`); }
  if (!r.address) { noAddr++; console.log(`  АДРЕС=НЕТ ${r.id.slice(0, 8)} ${r.city} ${(r.title_ru || r.title || '').slice(0, 40)}`); }
  for (const [k, [la, ln]] of Object.entries(FALL)) {
    if (r.lat != null && Math.abs(r.lat - la) < 0.0012 && Math.abs(r.lng - ln) < 0.0012) {
      fb++; console.log(`  ФОЛБЭК-ПИН ${r.id.slice(0, 8)} (${k}) ${r.city} адр=${(r.address || '-').slice(0, 45)} ${(r.title_ru || r.title || '').slice(0, 40)}`);
    }
  }
}
console.log(`ИТОГ: guard-нарушений ${guardBad}, фолбэк-пинов ${fb}, без гео ${noGeo}, без адреса ${noAddr}`);
for (const r of rows) {
  console.log([r.created_at, r.id.slice(0, 8), r.status, r.city, r.start_date, (r.start_time || '(нет)').slice(0, 5),
    (r.end_time || '-').slice(0, 5), r.lat == null ? 'ГЕО=НЕТ' : `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`,
    r.address ? 'адр=' + r.address.slice(0, 40) : 'АДРЕС=НЕТ', (r.title_ru || r.title || '').slice(0, 35)].join(' | '));
}
