// dot-city-vs-text-probe.mjs — класс «город в НАЗВАНИИ/АДРЕСЕ карточки ≠ поле city».
//
// Зачем: у cyprus.bz поле addressLocality в JSON-LD бывает ЛОЖНЫМ (run 264 ON AIR — пафосское
// событие помечено Айя-Напой; run 268 Pilates — лимасольское тоже), у Cyprus Now бывает ложно
// поле city записи (Parko Paliatso Luna Park, Айя-Напа, помечен Никосией). Ремонт без арбитра
// запрещён, поэтому зонд ГРУППИРУЕТ кандидатов и печатает округ точки, чтобы сразу было видно,
// кто прав: точка в округе названного города → править city; точка в округе city → править текст.
//
// Норма: кандидатов немного (единицы), каждый разобран арбитром. Ручки:
//   PROBE_STATUS=active,moderation,needs_changes (по умолчанию), PROBE_GEO=cy|all
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
);

const STATUS = (process.env.PROBE_STATUS || 'active,moderation,needs_changes').split(',').map((s) => s.trim());
const SCOPE = process.env.PROBE_GEO || 'cy';

// города/районы, по которым ведём сверку (RU-написание карточки + латиница источника)
const CITIES = [
  ['Пафос', /пафос|paphos/i],
  ['Лимасол', /лимасол|limassol/i],
  ['Ларнака', /ларнак|larnaca/i],
  ['Никосия', /никоси|nicosia/i],
  ['Ая-Напа', /ая-?нап|ayia napa|agia napa/i],
  ['Фамагуста', /фамагуста|famagusta|ammochostos/i],
  ['Паралимни', /паралимни|paralimni/i],
  ['Протарас', /протарас|protaras/i],
];

const inCyprus = (r) => r.lat != null && r.lng != null && r.lat > 34.4 && r.lat < 35.9 && r.lng > 32.1 && r.lng < 34.7;
const cityOf = (name) => CITIES.find(([n]) => n === name)?.[0];
const canon = (city) => CITIES.find(([, re]) => re.test(String(city || '')))?.[0] || null;

const rows = await selectAll(
  db, 'events',
  'id, title, title_ru, city, address, lat, lng, start_date, status, website, source_type',
  { filter: (q) => q.in('status', STATUS) },
);

const scope = SCOPE === 'all' ? rows : rows.filter(inCyprus);
console.log(`Живых карточек (${STATUS.join('/')}): ${rows.length}; в срезе «${SCOPE}»: ${scope.length}\n`);

const cands = [];
for (const r of scope) {
  const own = canon(r.city);
  if (!own) continue;
  const text = [r.title, r.title_ru, r.address].filter(Boolean).join(' \n ');
  const named = [...new Set(CITIES.filter(([, re]) => re.test(text)).map(([n]) => n))];
  const others = named.filter((n) => n !== own);
  if (others.length) cands.push({ r, own, others, extra: named.length > 2 || others.length > 1 });
}

console.log(`Кандидатов (в названии/адресе город ≠ city): ${cands.length}\n`);
for (const c of cands) {
  const { r, own, others } = c;
  console.log(`--- ${r.id} [${r.status}] city="${r.city}" (канон ${own})`);
  console.log(`    ${r.title}`);
  console.log(`    адрес: ${r.address || '—'} | пин ${r.lat},${r.lng} | названные города: ${others.join(', ')}${c.extra ? ' ← несколько, похоже тур' : ''}`);
  console.log(`    ${r.website || ''}`);
}
