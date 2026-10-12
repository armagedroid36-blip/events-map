// Читающий зонд: сколько балийских площадок ЖИВЫХ карточек сейчас «расщеплены»
// по метке района (одна площадка — больше одного района), и что изменил бы
// реестр venue-district.mjs. Приёмка правки сборщика Бали.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { venueKey } from './venue-city.mjs';
import { districtFor } from './bali-districts.mjs';
import { buildVenueDistrictRegistry, districtForVenue } from './venue-district.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const rows = await selectAll(db, 'events', 'id, title, city, address, lat, lng, status, source_type');
const districtOf = (city) => String(city || '').replace(/,\s*bali\s*$/i, '').trim();
const isBali = (r) => /,\s*bali$/i.test(String(r.city || '')) || districtOf(r.city) === 'Джакарта';

const live = rows.filter((r) => r.status === 'active' || r.status === 'moderation');
const registry = buildVenueDistrictRegistry(rows);

// группы «одна площадка — больше одной метки района» среди ЖИВЫХ
const groups = new Map();
for (const r of live) {
  if (!isBali(r)) continue;
  const k = venueKey(r.address, r.lat, r.lng);
  if (!k) continue;
  const per = groups.get(k) || new Map();
  per.set(districtOf(r.city), (per.get(districtOf(r.city)) || 0) + 1);
  groups.set(k, per);
}
const split = [...groups.entries()].filter(([, per]) => per.size > 1);
console.log(`Живых карточек: ${live.length}, площадок балийских (живых) с ключом: ${groups.size}`);
console.log(`Площадок с расхождением метки района среди ЖИВЫХ: ${split.length}`);
for (const [k, per] of split) {
  console.log(`  ${k} -> ${[...per.entries()].map(([d, n]) => `${d}×${n}`).join(', ')}`);
}

// что сделал бы сборщик: сколько ЖИВЫХ карточек сменило бы метку (dry)
let changed = 0;
for (const r of live) {
  if (!isBali(r)) continue;
  const byAddress = districtFor(r.address || '', null);
  const reg = districtForVenue({ address: r.address, lat: r.lat, lng: r.lng }, registry);
  if (reg && reg !== byAddress) {
    changed++;
    console.log(`  [dry] ${r.id} «${String(r.title).slice(0, 40)}» адресный район «${byAddress}» -> реестр «${reg}»`);
  }
}
console.log(`Смен метки района сборщиком (dry): ${changed}`);
