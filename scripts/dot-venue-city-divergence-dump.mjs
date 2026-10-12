// Дамп: ЖИВЫЕ карточки одной площадки с РАЗНЫМИ метками города (расщепление фильтра по городу).
// Запуск: node --env-file=.env scripts/dot-venue-city-divergence-dump.mjs
// Класс 186/187: площадка одна (имя + точка ~110 м), а меток city больше одной.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { buildVenueCityRegistry, venueKey } from './venue-city.mjs';
import { districtOfCity } from './cy-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const cols = 'id, city, address, lat, lng, status, title, title_ru, start_date, website, created_at';
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation']), log: (m) => console.log(m) });
const all = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation', 'archived']), log: () => {} });
const reg = buildVenueCityRegistry(all);

const groups = new Map();
for (const r of live) {
  const k = venueKey(r.address, r.lat, r.lng);
  if (!k) continue;
  const g = groups.get(k) || [];
  g.push(r);
  groups.set(k, g);
}

let n = 0;
console.log(`Живых карточек: ${live.length}, площадок (живых): ${groups.size}`);
for (const [k, rows] of groups) {
  const cities = new Map();
  for (const r of rows) cities.set(String(r.city || '').replace(/,\s*кипр/gi, '').trim(), (cities.get(String(r.city || '').replace(/,\s*кипр/gi, '').trim()) || 0) + 1);
  if (cities.size < 2) continue;
  n++;
  const e = reg.get(k);
  const rank = [...cities.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n#${n} площадка «${String(rows[0].address || '').split(',')[0]}»  ${Number(rows[0].lat).toFixed(4)},${Number(rows[0].lng).toFixed(4)}  живых ${rows.length}`);
  console.log(`   метки живых: ${rank.map(([c, v]) => `${c}=${v}`).join(', ')}  | реестр (живые+архив ${all.length}): ${e ? `«${e.city}» ${e.n}/${e.total}` : 'нет'}`);
  const dist = rows.map((r) => districtOfCity(r.city)).filter(Boolean);
  console.log(`   округ меток: ${[...new Set(dist)].join('/') || '-'}  округ большинства: ${districtOfCity(rank[0][0]) || '-'}`);
  for (const r of rows) console.log(`   ${r.id} [${r.status}] «${r.city}» ${r.start_date} ${String(r.title_ru || r.title || '').slice(0, 46)} | ${String(r.address || '').slice(0, 40)}`);
}
console.log(`\nПлощадок с расхождением метки СРЕДИ ЖИВЫХ: ${n}`);
process.exit(0);
