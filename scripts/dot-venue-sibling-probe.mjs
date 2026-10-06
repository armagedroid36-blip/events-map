// Читающий зонд: карточки, чей адрес называет площадку из списка — ищет «соседа»
// с уже проверенной (нецентровой) координатой, чтобы перенести её.
// node --env-file=.env scripts/dot-venue-sibling-probe.mjs [ключ ...]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

// «Центровые» фолбэки сборщика (город) — координата с них не доказательство площадки.
const CITY_FALLBACKS = new Set(['34.7071', '35.1856', '34.9167', '34.7754', '34.6802', '35.1699', '12.2388', '16.0544']);

const KEYS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['opus events', 'st raphael', 'camelot', 'xydadiko', 'ktima', 'latsia', 'sllip', 'johnny pep', 'synerjoy'];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,website');
console.log('строк в таблице:', rows.length);
for (const k of KEYS) {
  const list = rows.filter((r) => (r.address || '').toLowerCase().includes(k));
  const real = list.filter((r) => r.lat && !CITY_FALLBACKS.has(String(Number(r.lat).toFixed(4))));
  console.log(`\n== «${k}»: ${list.length} карточек, с НЕцентровой координатой ${real.length}`);
  for (const r of list) {
    const flag = r.lat && !CITY_FALLBACKS.has(String(Number(r.lat).toFixed(4))) ? ' ТОЧКА' : ' центр';
    console.log(`   ${String(r.id).slice(0, 8)} ${r.status} | ${r.lat},${r.lng}${flag} | ${r.city} | ${(r.address || '').slice(0, 60)} | ${r.title_ru || r.title}`);
  }
}
