// Точечная проверка после прогона collect-events: новые строки по created_at.
// Читает базу service-role ключом, пагинация через selectAll.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key, { auth: { persistSession: false } });

const SINCE = process.argv[2] || new Date(Date.now() - 60 * 60 * 1000).toISOString();

const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,start_date,status,website,source_type,created_at');
const rows = all.filter((r) => r.created_at >= SINCE).sort((a, b) => a.created_at.localeCompare(b.created_at));

console.log(`НОВЫХ С ${SINCE}: ${rows.length}`);
const byStatus = {};
const byCity = {};
let noGeo = 0, noAddr = 0, latinCity = 0;
const keyMap = new Map(), webMap = new Map();
for (const r of rows) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  byCity[r.city || '(нет)'] = (byCity[r.city || '(нет)'] || 0) + 1;
  if (r.lat == null || r.lng == null) noGeo++;
  if (!r.address) noAddr++;
  if (r.city && /[A-Za-z]/.test(r.city) && !/bali|SG|Cyprus|Vietnam/i.test(r.city)) latinCity++;
  const k = `${(r.title_ru || r.title || '').trim()}|${r.start_date}`;
  keyMap.set(k, (keyMap.get(k) || 0) + 1);
  if (r.website) webMap.set(r.website, (webMap.get(r.website) || 0) + 1);
}
console.log('по статусам', JSON.stringify(byStatus));
console.log('без координат', noGeo, '| без адреса', noAddr, '| латиница в city', latinCity);
console.log('города:', Object.entries(byCity).map(([c, n]) => `${c} ${n}`).join(', '));

// повторные вставки: ключ/website встречается в новых ИЛИ уже есть более ранний близнец во всей базе
const dupKey = [];
const dupWeb = [];
for (const r of rows) {
  const k = `${(r.title_ru || r.title || '').trim()}|${r.start_date}`;
  const twins = all.filter((x) => x.id !== r.id && `${(x.title_ru || x.title || '').trim()}|${x.start_date}` === k && x.created_at < r.created_at);
  if (twins.length) dupKey.push(`${r.id} ${r.title_ru || r.title} (${twins.map((t) => t.id + ':' + t.status).join(',')})`);
  if (r.website) {
    const tw = all.filter((x) => x.id !== r.id && x.website === r.website && x.created_at < r.created_at);
    if (tw.length) dupWeb.push(`${r.id} ${(r.title_ru || r.title || '').slice(0, 40)} -> ${tw.map((t) => t.id + ':' + t.status).join(',')}`);
  }
}
console.log('ПОВТОРНЫЕ по ключу название|дата:', dupKey.length ? dupKey.join(' | ') : 0);
console.log('ПОВТОРНЫЕ по website:', dupWeb.length ? dupWeb.join(' | ') : 0);

// канон района Бали: показать новые балийские карточки
const bali = rows.filter((r) => (r.city || '').includes('Bali'));
console.log('БАЛИ новых:', bali.length);
for (const b of bali.slice(0, 15)) console.log('  ', b.id, b.city, '|', (b.title_ru || b.title || '').slice(0, 45), '|', b.address || '(нет адреса)', '|', b.status);
