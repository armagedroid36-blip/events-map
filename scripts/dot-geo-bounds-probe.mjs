// Точка «События»: карточки-«выбросы» — живые события с координатами ВНЕ всех
// регионов геофокуса (Кипр / Бали / побережье Вьетнама). Ловит перепутанные/
// битые пины, попавшие в море или в другую страну. Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,source_type,website,created_at');

const BOXES = [
  ['Кипр', 34.40, 35.75, 32.10, 34.70],
  ['Бали', -8.95, -8.00, 114.35, 115.85],
  ['Вьетнам-побережье', 11.80, 16.45, 107.00, 109.70],
];

const live = rows.filter((r) => r.status !== 'archived');
const out = [];
let noGeo = 0;
for (const r of live) {
  if (r.lat == null || r.lng == null) { noGeo++; continue; }
  const lat = Number(r.lat), lng = Number(r.lng);
  const inside = BOXES.some(([, a, b, c, d]) => lat >= a && lat <= b && lng >= c && lng <= d);
  if (!inside) out.push(r);
}
console.log('живых', live.length, '| без координат', noGeo, '| вне всех регионов', out.length);
out.sort((a, b) => String(a.city).localeCompare(String(b.city)));
for (const r of out) {
  console.log([r.id.slice(0, 8), r.status, r.city, `${r.lat},${r.lng}`, r.start_date || '-',
    (r.title_ru || r.title || '').slice(0, 46), (r.address || '-').slice(0, 40), r.website ? 'url+' : 'url-'].join(' | '));
}
const byCity = {};
for (const r of out) byCity[r.city || '—'] = (byCity[r.city || '—'] || 0) + 1;
console.log('по городам:', JSON.stringify(byCity));
