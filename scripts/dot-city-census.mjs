// Перепись меток city: ищем «разъединённые» метки одного города (напр. «Никосия» vs «Никосия, Кипр»).
// Запуск из корня: node --env-file=.env scripts/dot-city-census.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const rows = await selectAll(db, 'events', 'id,status,city,title,start_date,lat,lng,source_type');
const act = rows.filter((r) => r.status === 'active');

const by = new Map();
for (const r of act) {
  const c = r.city === null || r.city === undefined ? '(пусто)' : String(r.city);
  by.set(c, (by.get(c) || 0) + 1);
}
const keys = [...by.keys()].sort();
console.log('уникальных меток city:', keys.length);
for (const k of keys) console.log('  [' + k + '] =', by.get(k));

// «Кипр»-метки: полная = «Город, Кипр»; ищем голые кипрские метки и метки с лишними пробелами/переносами
const cy = keys.filter((k) => /Кипр/i.test(k));
const bare = keys.filter((k) => !/,/.test(k) && !/Кипр/i.test(k));
console.log('\nметки с «Кипр»:', cy.length, '| без запятой (возможные разъединённые):', bare.length);
console.log('bare:', JSON.stringify(bare));

// кандидаты на разъединение: голая метка, у которой есть пара «<та же>…, Кипр»
const pairs = [];
for (const b of bare) {
  const hit = cy.find((c) => c.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(c.split(',')[0].toLowerCase()));
  if (hit) pairs.push([b, by.get(b), hit, by.get(hit)]);
}
console.log('\nПАРЫ (голая ↔ «…, Кипр»):');
for (const p of pairs) console.log('  [', p[0], '] =', p[1], '  ↔  [', p[2], '] =', p[3]);
const badIds = act.filter((r) => bare.includes(String(r.city)) && pairs.some((p) => p[0] === String(r.city)));
console.log('\nкарточек в голых метках-двойниках:', badIds.length);
for (const r of badIds) console.log(' ', r.id.slice(0, 8), r.city, '|', r.start_date, '|', (r.source_type || ''), '|', r.lat, r.lng, '|', (r.title || '').slice(0, 45));
