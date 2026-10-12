// Выравнивание метки города у ЖИВЫХ карточек одной площадки по метке большинства.
// Класс 186/187: площадка одна (имя + точка ~110 м), а меток city больше одной → фильтр по городу расщеплён.
// Арбитр — метка большинства СРЕДИ ЖИВЫХ карточек той же площадки (реестр venue-city.mjs как справка).
// Запуск: node --env-file=.env scripts/dot-venue-city-align.mjs        (DRY)
//         APPLY=1 node --env-file=.env scripts/dot-venue-city-align.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { buildVenueCityRegistry, venueKey } from './venue-city.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const bare = (c) => String(c || '').replace(/,\s*кипр/gi, '').trim();

const cols = 'id, city, address, lat, lng, status, title, start_date';
const live = await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation']), log: () => {} });
const reg = buildVenueCityRegistry(await selectAll(db, 'events', cols, { filter: (q) => q.in('status', ['active', 'moderation', 'archived']), log: () => {} }));

const groups = new Map();
for (const r of live) {
  const k = venueKey(r.address, r.lat, r.lng);
  if (!k) continue;
  const g = groups.get(k) || [];
  g.push(r);
  groups.set(k, g);
}

let planned = 0, applied = 0, skipped = 0;
for (const [k, rows] of groups) {
  const votes = new Map();
  for (const r of rows) {
    const c = bare(r.city);
    if (c) votes.set(c, (votes.get(c) || 0) + 1);
  }
  if (votes.size < 2) continue;
  const [major, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  const e = reg.get(k);
  const venue = String(rows[0].address || '').split(',')[0];
  console.log(`Площадка «${venue}»: живых меток ${[...votes.entries()].map(([c, v]) => `${c}=${v}`).join(', ')} | реестр: ${e ? `«${e.city}» ${e.n}/${e.total}` : '-'} | метка большинства «${major}»`);
  if (n < 2) { console.log('   ОТКЛОНЕНО: у большинства меньше 2 живых карточек — арбитра нет'); continue; }
  for (const r of rows) {
    if (bare(r.city) === major) continue;
    planned++;
    if (!APPLY) { console.log(`   DRY ${r.id.slice(0, 8)} «${r.city}» -> «${r.city.replace(bare(r.city), '')}${major}»`); continue; }
    const patch = { city: String(r.city || '').replace(bare(r.city), major) };
    const { data, error } = await db.from('events').update(patch).eq('id', r.id).select('id, city, status');
    if (error || !data?.length) { console.log(`   ОШИБКА ${r.id.slice(0, 8)}: ${error?.message || 'запись не изменилась'}`); skipped++; continue; }
    const back = data[0];
    if (bare(back.city) !== major || back.status !== r.status) { console.log(`   ОТКЛОНЕНО (контроль) ${r.id.slice(0, 8)}: ${back.status}/${back.city}`); skipped++; continue; }
    applied++;
    console.log(`   ЗАПИСАНО ${r.id.slice(0, 8)}: «${back.city}» (${back.status})`);
  }
}
console.log(`\nИТОГ: план ${planned}, применено ${applied}, пропущено ${skipped}${APPLY ? '' : ' (DRY)'}`);
process.exit(0);
