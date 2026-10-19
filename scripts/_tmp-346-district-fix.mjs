// Проверка правки районов Берава/Умалас + ремонт city у двух живых карточек.
// DRY по умолчанию, APPLY=1 пишет. Печатает соседей по площадке перед правкой.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { BALI_DISTRICT_CENTERS, districtFor, missingCenterLabels } from './bali-districts.mjs';

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);
const APPLY = process.env.APPLY === '1';

console.log('без центра:', JSON.stringify(missingCenterLabels()));
console.log('districtFor Berawa:', districtFor('Jalan Pantai Berawa, Tibubeneng', 'berawa'));
console.log('districtFor Umalas:', districtFor('Jl. Umalas, Kerobokan', 'umalas'));
console.log('центры:', JSON.stringify(BALI_DISTRICT_CENTERS['берава']), JSON.stringify(BALI_DISTRICT_CENTERS['умалас']));

const rows = await selectAll(db, 'events', 'id,city,title,address,lat,lng,status,start_date,website', {
  filter: (q) => q.in('status', ['active', 'moderation']),
});
const targets = rows.filter((r) => /^(берава|умалас), bali$/i.test(String(r.city || '').trim()));
console.log('целей:', targets.length);
for (const t of targets) {
  const canon = /^берава/i.test(t.city) ? 'Чангу, Bali' : 'Керобокан, Bali';
  console.log(`- ${t.id} | ${t.city} -> ${canon} | ${t.start_date} | пин ${t.lat},${t.lng} | ${String(t.title).slice(0, 55)}`);
  const near = rows.filter(
    (r) => r.id !== t.id && r.lat && t.lat &&
      Math.abs(r.lat - t.lat) < 0.02 && Math.abs(r.lng - t.lng) < 0.02
  );
  console.log(`  соседей в 2 км: ${near.length}; их города: ${[...new Set(near.map((n) => n.city))].join(' / ') || '-'}`);
  if (APPLY) {
    const { data, error } = await db.from('events').update({ city: canon }).eq('id', t.id).select('id,city,status');
    console.log('  update:', JSON.stringify(data), error ? `ОШИБКА ${error.message}` : 'ok');
  }
}
if (!APPLY) console.log('DRY: правок не было (APPLY=1 для записи)');
