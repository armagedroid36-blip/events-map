// Приёмка правила «деревня-серия» (713) на РЕАЛЬНЫХ строках базы.
// node --env-file=.env scripts/_tmp713_village.mjs
import { createClient } from '@supabase/supabase-js';
import { buildVillageAggregates, coveredByVillageSeries } from './village-series.mjs';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const cols = 'status,title,title_ru,title_en,start_date,end_date';
const parts = [];
for (const pat of ['%Village%', '%деревня%', '%деревни%', '%χωριό%']) {
  const { data, error } = await db.from('events').select(cols).in('status', ['active', 'moderation', 'needs_changes']).ilike('title', pat);
  if (error) { console.error('err', pat, error.message); continue; }
  parts.push(...(data || []));
}
const uniq = new Map(parts.map((r) => [`${r.title}|${r.start_date}`, r]));
const rows = [...uniq.values()];
const aggs = buildVillageAggregates(rows);
console.log(`строк-кандидатов в агрегаты: ${rows.length}, агрегатов распознано: ${aggs.length}`);
for (const a of aggs) console.log(`  ${a.title.slice(0, 60)} | ${a.start}..${a.end} | ${a.tokens.join(',')}`);

// Недельные записи, которые снимались вручную в 687/694/711 (реальные строки, уже archived).
const cases = [
  ['Χριστουγεννιάτικο Χωριό Φικάρδου', '2026-11-28', '2026-11-29', true],
  ['Χριστουγεννιάτικο Χωριό Φικάρδου', '2026-12-05', '2026-12-06', true],
  ['Χριστουγεννιάτικο Χωριό Καλοπαναγιώτη', '2026-11-28', '2026-11-29', true],
  ['Χριστουγεννιάτικο Χωριό Καλοπαναγιώτη', '2026-12-05', '2026-12-06', true],
  ['Χριστουγεννιάτικο Χωριό Λευκάρων', '2026-12-26', '2026-12-27', true],
  ['Χριστουγεννιάτικο Χωριό Αγρού', '2026-11-28', '2026-11-29', false], // агрегат Агрос архивный (687), сейчас не живой
  ['Φεστιβάλ Ζιβανίας στο Πελένδρι 2026', '2026-11-28', '2026-11-29', false],
];
let okC = 0;
for (const [t, s, e, exp] of cases) {
  const got = coveredByVillageSeries(aggs, { title: t, start_date: s, end_date: e });
  const ok = got === exp;
  if (ok) okC += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${t.slice(0, 45)} ${s}: ${got} (ожидали ${exp})`);
}
console.log(`\n${okC}/${cases.length} ok`);
