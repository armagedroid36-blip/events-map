// Читающий зонд: метки района Бали не по канону (фолбэк «Bali»), пины на центре острова.
// Запуск: node --env-file=.env scripts/dot-bali-label-gap-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status,start_date', {});

const bali = rows.filter(r => /bali|бали/i.test(String(r.city || '')));
console.log('строк всего:', rows.length, '| балийских меток:', bali.length);

const byCity = new Map();
for (const r of bali) byCity.set(r.city, (byCity.get(r.city) || 0) + 1);
const odd = [...byCity.entries()].filter(([c]) => {
  const d = String(c).replace(/,\s*bali\s*$/i, '');
  return !String(c).includes(',') || d.toLowerCase() === 'bali' || d.toLowerCase() === 'бали';
});
console.log('нестандартных меток:', odd.length);
for (const [c, n] of odd.sort((a, b) => b[1] - a[1])) console.log('  ', JSON.stringify(c), n);

const canon = new Set(Object.keys(BALI_DISTRICT_CENTERS));
const nonCanon = [...byCity.entries()].filter(([c]) => {
  const d = String(c).replace(/,\s*bali\s*$/i, '').toLowerCase();
  return !canon.has(d);
});
console.log('меток вне канона BALI_DISTRICT_CENTERS:', nonCanon.length);
for (const [c, n] of nonCanon.sort((a, b) => b[1] - a[1])) console.log('  ', JSON.stringify(c), n, canon.has(String(c).replace(/,\s*bali\s*$/i, '').toLowerCase()) ? '' : 'нет ключа');

const ISLAND = [-8.4095, 115.1889];
const near = (a, b) => Math.abs(Number(a) - b) < 0.0012;
const onIsland = bali.filter(r => r.lat != null && near(r.lat, ISLAND[0]) && near(r.lng, ISLAND[1]));
console.log('пин ровно на центре острова:', onIsland.length);
for (const r of onIsland) console.log('  ', r.id.slice(0, 8), r.status, r.start_date, JSON.stringify(r.city), JSON.stringify(r.address), String(r.title).slice(0, 45));

const noGeo = bali.filter(r => r.lat == null || r.lng == null);
console.log('балийских без координат:', noGeo.length);
const live = bali.filter(r => r.status === 'active' || r.status === 'moderation');
console.log('живых балийских:', live.length, '| нестандартных меток среди живых:',
  live.filter(r => { const d = String(r.city).replace(/,\s*bali\s*$/i, '').toLowerCase(); return !canon.has(d); }).length);
