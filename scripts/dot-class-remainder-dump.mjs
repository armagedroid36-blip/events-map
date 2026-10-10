import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const PREFIX = [
  '6814e5a2', '74c9d67c', // Puffy Edition
  'ad6c4d40', '123cf6a2', // Regatta ILCA4
  '84550b4d', '550ee10d', // Regatta Optimist
  'de6b73d6', '4a8ae5ce', // Leptos
  '5ecf6442', '4f7c7c01', // Cine Volos
  'f06adb91', '2a018b48', // Silva Immersion
  'af4fba74', '2cb0ef3c', // Toumbas
  '09dfccb8', '493a7af2', // Η Κοιλιά
];
const rows = await selectAll(db, 'events', 'id,title,title_ru,start_date,end_date,start_time,city,address,lat,lng,status,website');
console.log('всего строк', rows.length);
for (const p of PREFIX) {
  const r = rows.find(x => x.id.startsWith(p));
  if (!r) { console.log(p, 'НЕ НАЙДЕНО'); continue; }
  console.log([p, r.status, r.start_date, r.end_date || '-', r.start_time || '-', r.city, '|', (r.title || '').slice(0, 62), '|', (r.address || '').slice(0, 40), '|', String(r.website || '').slice(0, 70)].join('  '));
}
