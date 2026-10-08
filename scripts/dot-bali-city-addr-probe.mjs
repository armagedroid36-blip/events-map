// Читающий зонд: живые балийские карточки, у которых район, выведенный из АДРЕСА (districtFor),
// расходится с меткой city. Источник дрейфа — добор адреса уже после вставки (адрес уровня улицы/Nominatim).
// Запуск: node --env-file=.env scripts/dot-bali-city-addr-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtFor } from './bali-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
const bali = rows.filter((r) => (r.city || '').includes('Bali'));
console.log('живых балийских карточек:', bali.length);

const bad = [];
for (const r of bali) {
  const label = (r.city || '').replace(/,\s*Bali$/, '');
  const byAddr = districtFor(r.address || '', null);
  if (!r.address) continue;
  if (byAddr !== label) bad.push({ r, label, byAddr });
}
console.log('метка city расходится с районом из адреса:', bad.length);
for (const { r, label, byAddr } of bad) {
  console.log(JSON.stringify({ id: r.id.slice(0, 8), label, byAddr, address: r.address, lat: r.lat, lng: r.lng, status: r.status, title: r.title_ru || r.title, website: r.website }));
}
