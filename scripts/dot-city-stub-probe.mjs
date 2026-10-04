// Проба: карточки, вылеченные ремонтом координат-заглушек (запуск 28) — что в city/address.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const IDS = ['22f4448c', '3845e750', 'dbb4cbec', 'b2cc4009', '55f102fe', '4116c490'];
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date');
for (const pref of IDS) {
  const r = rows.find((x) => x.id.startsWith(pref));
  if (!r) { console.log(pref, 'нет'); continue; }
  console.log(pref, '|', r.status, '|', r.city, '|', r.address || '-', '|', r.lat, r.lng, '|', (r.title_ru || r.title || '').slice(0, 45), '|', r.start_date);
}
// сколько всего active по каждому city (топ-20), чтобы понять канон
const act = rows.filter((r) => r.status === 'active');
const cnt = {};
for (const r of act) cnt[r.city || '(пусто)'] = (cnt[r.city || '(пусто)'] || 0) + 1;
console.log('--- active', act.length, 'city', Object.keys(cnt).length);
for (const [c, n] of Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(n, c);
