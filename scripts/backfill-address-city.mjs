// Заполнить пустой address у карточек, чьи координаты — «центр города» (fallback сборщика).
//
// Зачем: у части событий Cyprus Now / TG-каналов источник не даёт площадку вообще
// (ни имени, ни адреса) — карточка получает координаты центра города. Обратное
// геокодирование по такой точке улицы не даёт, поэтому backfill-address-geo такие
// карточки не лечит и «без адреса» не убывает. Здесь ставим честный адрес уровня
// города (он же есть в поле city) — данные не выдумываем.
//
// Признак fallback-точки: те же (город, lat, lng) встречаются у 3+ карточек
// активной ленты (центр города, куда сборщик ставит события без площадки).
//
// Запуск: node --env-file=.env scripts/backfill-address-city.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,website,status',
  { filter: (q) => q.eq('status', 'active') });
const noAddr = rows.filter((e) => !e.address);
console.log(`active: ${rows.length}, без адреса: ${noAddr.length}`);

const key = (e) => `${e.city} | ${Number(e.lat).toFixed(5)},${Number(e.lng).toFixed(5)}`;
const counts = new Map();
for (const e of rows) counts.set(key(e), (counts.get(key(e)) || 0) + 1);

const targets = noAddr.filter((e) => (counts.get(key(e)) || 0) >= 3 && e.city);
console.log(`из них на «центре города» (3+ карточки в одной точке): ${targets.length}`);
const byCity = new Map();
for (const e of targets) byCity.set(e.city, (byCity.get(e.city) || 0) + 1);
console.log('по городам:', [...byCity.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));

const skipped = noAddr.filter((e) => !targets.includes(e));
console.log(`остаются без адреса (реальные координаты без адреса или нет города): ${skipped.length}`);
for (const e of skipped.slice(0, 6)) console.log(`  ${e.id.slice(0, 8)} | ${e.city} | ${Number(e.lat).toFixed(4)},${Number(e.lng).toFixed(4)} | ${(e.website || '').slice(0, 55)}`);

let ok = 0;
for (const e of targets) {
  const addr = e.city.replace(/\s*,\s*кипр$/i, '') + (/кипр/i.test(e.city) ? ', Кипр' : '');
  if (!APPLY) { if (ok < 5) console.log(`  [dry] ${e.id.slice(0, 8)} -> "${addr}"`); ok++; continue; }
  const { error } = await db.from('events').update({ address: addr, updated_at: new Date().toISOString() }).eq('id', e.id);
  if (error) { console.error(`  ! ${e.id.slice(0, 8)}: ${error.message}`); continue; }
  ok++;
}
console.log(`${APPLY ? 'Записано' : '[dry] было бы записано'}: ${ok}`);
