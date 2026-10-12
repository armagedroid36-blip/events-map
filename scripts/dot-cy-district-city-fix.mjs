// Ремонт city Кипра по округу точки + отчёт по карточкам вне полигонов.
// DRY по умолчанию, APPLY=1 — запись. Только SUPABASE_SERVICE_ROLE (anon под RLS врёт).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtNear, cityForPoint } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// Проверенные правки: метка источника противоречит округу точки.
// d39ce2c3 «Γιορτή της Ζιβανίας 2026 στην Άλωνα» — площадка Alona Village Square,
// Алона (Αλόνα) — деревня округа Никосия, точка 34.9343,33.0396 внутри полигона Никосии.
const FIXES = [
  { id: 'd39ce2c3', from: 'Лимасол', to: 'Никосия, Кипр', why: 'Алона — деревня округа Никосия (точка в полигоне Никосии)' },
  // Fyti Village Square (Φύτη) — одна площадка 34.9287321,32.5437806 получала на карточках
  // две разные метки города в зависимости от городского среза ленты Cyprus Now (paphos -> «Пафос»,
  // polis -> «Полис»). Арбитр — сам источник: venue.slug площадки = «fyti-village-square-paphos»,
  // venue.city = Fyti, деревня Фита в округе Пафос. Канон — «Пафос, Кипр».
  { id: 'b7e2b7f4', from: 'Полис', to: 'Пафос, Кипр', why: 'Fyti Village Square, venue.slug источника …-paphos' },
  { id: '2e35d25b', from: 'Полис', to: 'Пафос, Кипр', why: 'Fyti Village Square, venue.slug источника …-paphos' },
  { id: '0b219087', from: 'Полис', to: 'Пафос, Кипр', why: 'Fyti Village Square, venue.slug источника …-paphos' },
  // Castle Club (Ая-Напа, 34.9898,33.9980): 22 живые карточки в метке «Ая-Напа», одна — «Фамагуста»,
  // хотя название события прямо говорит «in Ayia Napa». Метка приводится к соседям по площадке.
  { id: '64df71ce', from: 'Фамагуста', to: 'Ая-Напа, Кипр', why: 'Castle Club, Ayia Napa — 22 соседние карточки той же площадки в метке «Ая-Напа»' },
];

const rows = await selectAll(db, 'events', 'id,status,city,address,lat,lng,website,title');
const cy = rows.filter((r) => /кипр/i.test(r.city || '') && r.lat && r.lng);

console.log('APPLY =', APPLY);
for (const f of FIXES) {
  const r = cy.find((x) => x.id.startsWith(f.id));
  if (!r) { console.log('НЕ НАЙДЕНО', f.id); continue; }
  const d = districtOf(Number(r.lat), Number(r.lng));
  const canon = cityForPoint(Number(r.lat), Number(r.lng));
  console.log(`${f.id} сейчас «${r.city}» (${r.status}) -> округ точки ${d}, canon ${canon} | ${f.why}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ city: f.to }).eq('id', r.id).select('id,city,status');
  if (error) { console.log('  ОШИБКА', error.message); continue; }
  console.log('  записано:', data.length, data[0] && data[0].city);
}

const outside = cy.filter((r) => !districtOf(Number(r.lat), Number(r.lng)));
console.log('вне полигонов:', outside.length);
for (const r of outside) {
  const near = districtNear(Number(r.lat), Number(r.lng));
  console.log(' ', r.id.slice(0, 8), r.city, '|', Number(r.lat).toFixed(4) + ',' + Number(r.lng).toFixed(4),
    '| ближайший округ:', near || '—', '| совпадает с city:', near && r.city.toLowerCase().startsWith(near.toLowerCase()) ? 'да' : 'НЕТ',
    '|', (r.address || '—').slice(0, 40));
}
