// ЧИТАЮЩИЙ зонд: площадки city-срезов Cyprus Now (для добора карточек Кипра на центровом фолбэке).
// ВАЖНО: напрямую из RU fetch рвётся/таймаутит — тянем curl через прокси 10809 (spawnSync + stdout,
// как в dot-cy-bz-301-canon-fix.mjs; execFileSync с -o падает по exit 23).
// Использование: node scripts/dot-cy-nilim-date-twin.mjs paphos larnaca
import { spawnSync } from 'node:child_process';

const PROXY = process.env.CN_PROXY || 'http://127.0.0.1:10809';
const cities = process.argv.slice(2);
if (!cities.length) { console.log('укажи слаги городов: paphos larnaca nicosia limassol'); process.exit(0); }

function slice(city) {
  const url = `https://cyprusnow.app/api/events?city=${city}&limit=200`;
  const r = spawnSync('curl', ['-s', '--max-time', '45', '-x', PROXY, url], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) throw new Error(`curl status=${r.status} err=${r.error?.message || ''}`);
  return JSON.parse(r.stdout);
}

for (const city of cities) {
  let j;
  try { j = slice(city); } catch (e) { console.log(`=== ${city}: ОШИБКА ${e.message}`); continue; }
  const evs = j.events || [];
  const venues = new Map();
  for (const e of evs) {
    const v = e.venue || {};
    if (!v.name || !v.lat || !v.lng) continue;
    if (!venues.has(v.name)) venues.set(v.name, { city: v.city, lat: v.lat, lng: v.lng, n: 0 });
    venues.get(v.name).n++;
  }
  console.log(`=== ${city}: событий ${evs.length}, площадок с координатами ${venues.size}`);
  for (const [name, v] of [...venues.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`   ${String(v.n).padStart(3)} | ${name} | ${v.city} | ${v.lat},${v.lng}`);
  }
}
