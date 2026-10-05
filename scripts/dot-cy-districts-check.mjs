// Проверка cy-districts.mjs по базе: округ/город по координатам vs текущий city.
// node --env-file=.env scripts/dot-cy-districts-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, cityForPoint } from './cy-districts.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,lat,lng,status,address');
const cy = rows.filter((r) => r.status === 'active' && r.lat && r.lng && r.lat > 34.4 && r.lat < 35.85 && r.lng > 32.0 && r.lng < 34.75);
console.log('active Кипра с координатами:', cy.length);
const noDist = cy.filter((r) => !districtOf(r.lat, r.lng));
console.log('вне полигонов округов:', noDist.length, noDist.slice(0, 5).map((r) => `${r.id.slice(0, 8)} ${r.city} ${r.lat},${r.lng}`).join(' | '));
const bad = [];
for (const r of cy) {
  const c = cityForPoint(r.lat, r.lng);
  const cur = (r.city || '').split(',')[0].trim();
  if (c && c !== cur) bad.push({ id: r.id, cur, c, t: (r.title || '').slice(0, 42), a: (r.address || '').slice(0, 40), lat: r.lat, lng: r.lng });
}
console.log('расхождений city:', bad.length);
for (const b of bad) console.log(` ${b.id.slice(0, 8)} «${b.t}» city=${b.cur} -> ${b.c} [${b.a}] ${b.lat},${b.lng}`);
// контрольные карточки запуска 30 (ниже — минимум 4: Geri/Nikitari/Pano Lefkara/Pissouri)
for (const id8 of ['22f4448c', '3845e750', 'dbb4cbec', 'b2cc4009', '55f102fe', '4116c490']) {
  const r = cy.find((x) => x.id.startsWith(id8));
  if (r) console.log(`контроль ${id8}: city=${r.city} -> ${cityForPoint(r.lat, r.lng)} (${r.lat},${r.lng})`);
  else console.log(`контроль ${id8}: нет в active Кипра`);
}
