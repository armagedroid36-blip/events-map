// Постоянный зонд класса «одна площадка (адрес 1:1) — РАЗНЫЕ city у живых карточек».
// Такая группа = кандидат на ложную метку города (класс 269/271: агрегатор метит округом,
// bz ставит ложную addressLocality). Норма — 0 групп: одинаковый адрес в двух городах
// почти всегда означает, что у одной из карточек city неверный.
// Однофамильные сети (Frederick University в Лимасоле и Никосии, «Village square») законны,
// их различает ПИН: у настоящей сети точки в разных округах — поэтому в выводе печатается
// расстояние между пинами и округ точки (по городам Кипра) для ручного разбора.
// Ручки: PROBE_STATUS=active,moderation,needs_changes, PROBE_LIMIT=N.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isCityOnlyVenue } from './cy-districts.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const STATUS = (process.env.PROBE_STATUS || 'active,moderation,needs_changes').split(',').map((s) => s.trim());
const LIMIT = Number(process.env.PROBE_LIMIT || 100);

const norm = (s) => String(s || '').toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const km = (a, b) => {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const all = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website,source_type');
const live = all.filter((r) => STATUS.includes(r.status));
const geo = live.filter((r) => r.lat != null && r.lng != null
  && r.address && norm(r.address).length >= 6 && !isCityOnlyVenue(r.address));

const groups = new Map();
for (const r of geo) {
  const k = norm(r.address);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const out = [];
for (const [k, rows] of groups) {
  if (rows.length < 2) continue;
  if (new Set(rows.map((r) => String(r.city || '').trim())).size < 2) continue;
  out.push({ k, rows });
}

console.log(`живых (${STATUS.join('/')}) ${live.length} | с гео и адресом-площадкой ${geo.length} | групп «адрес 1:1, разные city»: ${out.length}`);
out.sort((a, b) => b.rows.length - a.rows.length);
for (const g of out.slice(0, LIMIT)) {
  console.log(`\n=== АДРЕС: ${g.rows[0].address} | cities: ${[...new Set(g.rows.map((r) => r.city))].join(' / ')}`);
  for (const r of g.rows) {
    console.log(`  ${r.id.slice(0, 8)} [${r.status}] city=${r.city} | ${r.start_date} | ${r.lat.toFixed(5)},${r.lng.toFixed(5)} | ${(r.title_ru || r.title || '').slice(0, 46)} | ${String(r.website || '').slice(0, 70)}`);
  }
  const seen = new Set();
  for (let i = 0; i < g.rows.length; i++) {
    for (let j = i + 1; j < g.rows.length; j++) {
      const a = g.rows[i], b = g.rows[j];
      if (a.city === b.city) continue;
      const key = [a.city, b.city].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ~ ${a.city} vs ${b.city}: ${km(a, b).toFixed(2)} км (разные округа = однофамильные площадки/сеть, законно; <3 км = кандидат на ложную метку)`);
    }
  }
}
console.log('\nРазбор: пин в округе ОДНОГО города, а метка второго → править city (правило snapDistrictLabel, порог 3 км).');
