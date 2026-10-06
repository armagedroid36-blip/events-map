// Перенос проверенной точки и city с «соседа» в базе на карточку, стоящую на центровом фолбэке.
// Сосед — карточка, чей адрес называет тот же населённый пункт/площадку и у которой точка НЕ центровой фолбэк.
// Страховки: цель обязана быть на центровом фолбэке; у соседа точка не фолбэк; округ точки соседа совпадает
// с округом его city (иначе сосед сам битый); новый city != старый; сдвиг > 50 м. DRY по умолчанию, APPLY=1.
// node --env-file=.env scripts/dot-cy-place-sibling-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtOfCity, cityForPoint, km } from './cy-districts.mjs';

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const FALLBACKS = new Set(['34.7071', '35.1856', '34.9167', '34.7754', '34.6802', '35.1699', '34.9182']);
const isFallback = (lat) => lat && FALLBACKS.has(String(Number(lat).toFixed(4)));

// цель -> населённый пункт, по которому ищем соседа (регистр не важен)
const TARGETS = [
  { id: 'd26c7381', place: 'pedoulas' },
  { id: '4cf5d3f2', place: 'kalopanayiotis' },
];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date');
let ok = 0, err = 0;
for (const t of TARGETS) {
  const card = rows.find((r) => String(r.id).startsWith(t.id));
  if (!card) { console.log(`${t.id}: карточка не найдена`); continue; }
  const title = card.title_ru || card.title;
  if (!isFallback(card.lat)) { console.log(`${t.id} «${title}»: НЕ на центровом фолбэке (${card.lat},${card.lng}) — пропуск`); continue; }
  const sibs = rows.filter(
    (r) => r.status !== 'archived' && r.id !== card.id && (r.address || '').toLowerCase().includes(t.place) && r.lat && !isFallback(r.lat),
  );
  if (!sibs.length) { console.log(`${t.id} «${title}»: соседей с точкой нет — пропуск`); continue; }
  // точка-эталон = самая частая среди соседей
  const tally = new Map();
  for (const s of sibs) {
    const k = `${s.lat},${s.lng}`;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  const [point, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [lat, lng] = point.split(',').map(Number);
  const ref = sibs.find((s) => `${s.lat},${s.lng}` === point);
  // сосед сам согласован: округ его city == округ его точки
  const sibCityDistrict = districtOfCity(ref.city);
  const sibPointDistrict = districtOf(ref.lat, ref.lng);
  if (sibCityDistrict && sibPointDistrict && sibCityDistrict !== sibPointDistrict) {
    console.log(`${t.id} «${title}»: сосед сам в чужом округе (${ref.city} vs ${sibPointDistrict}) — пропуск`);
    continue;
  }
  const newCity = cityForPoint(lat, lng);
  const d = km(card.lat, card.lng, lat, lng);
  if (newCity === card.city) { console.log(`${t.id} «${title}»: city уже верный (${newCity}) — нужен только пин? пропуск`); continue; }
  const line = `${t.id} «${title}» (${card.start_date}, ${card.city}) -> ${newCity}, ${lat},${lng} | сдвиг ${d.toFixed(2)} км | сосед ${String(ref.id).slice(0, 8)} «${(ref.address || '').slice(0, 55)}» (${ref.city}) ×${n}`;
  if (d < 0.05) { console.log(line + ' | уже на месте — пропуск'); continue; }
  if (!APPLY) { console.log('[DRY] ' + line); continue; }
  const { data, error } = await db.from('events').update({ lat, lng, city: newCity }).eq('id', card.id).select('id,lat,lng,city');
  if (error || !data?.length) { console.log(line + ' ОШИБКА: ' + (error?.message || 'обновлено 0 строк')); err++; continue; }
  const back = data[0];
  console.log(line + ` записано -> ${back.lat},${back.lng} ${back.city}`);
  ok++;
}
console.log(`\nГотово: применено ${ok}, ошибок ${err}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
