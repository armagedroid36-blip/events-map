// Читающий зонд: живые города и страна по справочнику src/lib/countries.ts.
// Цель — найти города, для которых фильтр «Страна» даёт пусто (группа «Другие»).
// Справочник читается прямо из TS-исходника (RULES), чтобы не расходиться с фронтом.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const ts = readFileSync(new URL('../src/lib/countries.ts', import.meta.url), 'utf8');
const block = ts.slice(ts.indexOf('const RULES'), ts.indexOf('/** Страна по названию города'));
const RULES = [];
const re = /\{\s*keys:\s*\[([^\]]*)\],\s*country:\s*'([^']+)'\s*\}/g;
let m;
while ((m = re.exec(block))) {
  const keys = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  RULES.push({ keys, country: m[2] });
}
if (!RULES.length) throw new Error('RULES не распарсились');
console.log('правил в справочнике:', RULES.length);

function detectCountry(city) {
  if (!city) return '';
  const c = city.toLowerCase();
  for (const r of RULES) if (r.keys.some((k) => c.includes(k))) return r.country;
  return '';
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,status,city,country,source_type,start_date');
const live = rows.filter((r) => ['active', 'moderation'].includes(r.status));
const g = new Map();
for (const r of live) g.set(r.city || '?', (g.get(r.city || '?') || 0) + 1);

const unknown = [];
for (const [city, n] of [...g.entries()].sort((a, b) => b[1] - a[1])) {
  const d = detectCountry(city);
  if (!d) unknown.push([n, city]);
}
console.log(`живых ${live.length} | городов ${g.size} | без страны (группа «Другие»): ${unknown.length}`);
for (const [n, city] of unknown) console.log(`  ${n}\t${city}`);
