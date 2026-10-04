// Перенос проверенных гео/адреса/времени с живой карточки на её «серии»-близнецы,
// которые пришли из источника без площадки (нет координат -> вечно висят в needs_changes).
// Группа: город + первые 4 значимых слова названия. Источник данных — уже проверенная
// active-карточка того же события (не догадка).
// Запуск: node --env-file=.env scripts/dot-series-geo-link.mjs        (сухой)
//         APPLY=1 node --env-file=.env scripts/dot-series-geo-link.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const rows = await selectAll(db, 'events', 'id,status,title,title_ru,title_en,city,start_date,start_time,address,lat,lng,website');

const toks = (t) =>
  String(t || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));
const key = (r) => `${String(r.city || '').toLowerCase()}|${toks(r.title).slice(0, 4).join(' ')}`;
const hasGeo = (r) => r.lat != null && r.lng != null;
const empty = (v) => v === null || v === undefined || v === '';

const donors = new Map();
for (const r of rows) {
  if (r.status === 'active' && hasGeo(r) && r.address) {
    const k = key(r);
    if (!donors.has(k)) donors.set(k, r);
  }
}
const targets = rows.filter(
  (r) => ['moderation', 'needs_changes', 'rejected'].includes(r.status) && !hasGeo(r) && donors.has(key(r)),
);
console.log('доноров (active с гео+адресом):', donors.size, '| целей-серий без гео:', targets.length, '| режим:', APPLY ? 'APPLY' : 'dry');
for (const t of targets) {
  const d = donors.get(key(t));
  const patch = { address: t.address || d.address, lat: d.lat, lng: d.lng };
  if (empty(t.start_time) && !empty(d.start_time)) patch.start_time = d.start_time;
  console.log(`  ${t.id.slice(0, 8)} ${t.status} ${t.start_date} ${t.city} | ${(t.title || '').slice(0, 40)} <- ${d.id.slice(0, 8)} ${d.address}`);
  if (APPLY) {
    const { data, error } = await db.from('events').update(patch).eq('id', t.id).select('id');
    if (error) console.log('   ОШИБКА:', error.message);
    else console.log('   обновлено строк:', (data || []).length, JSON.stringify(patch));
  }
}
if (!APPLY) console.log('DRY RUN (для записи: APPLY=1)');
