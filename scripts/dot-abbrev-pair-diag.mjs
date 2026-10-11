import { createClient } from '@supabase/supabase-js';
import { abbrevWords, abbrevOverlap, words, GENERIC, PLACE_STOP, ADDR_STOP, norm, isCityLevelAddr, liveAbbrevMatch } from './live-dupe-key.mjs';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const prefix = process.argv.slice(2);
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,address,city,start_date,start_time,lat,lng,status');
const data = all.filter((r) => prefix.some((p) => r.id.startsWith(p)));
for (const r of data) {
  console.log('---', r.id.slice(0, 8), r.status, r.title, '|', r.city, '|', r.start_time);
  for (const k of ['title', 'title_ru', 'title_en']) console.log('   ', k, '=>', JSON.stringify(abbrevWords(r[k])));
  const pt = new Set(words(norm(r.address)).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w) && !ADDR_STOP.has(w)));
  console.log('    placeTokens:', [...pt].join(' '), '| cityLevel:', isCityLevelAddr(r), '|', String(r.address).slice(0, 80));
}
const [a, b] = data;
console.log('ov =', abbrevOverlap(a, b));
const sa = new Set(words(norm(a.address)).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w) && !ADDR_STOP.has(w)));
const sb = new Set(words(norm(b.address)).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w) && !ADDR_STOP.has(w)));
const addrWords = new Set([...sa, ...sb]);
console.log('addrWords:', [...addrWords].join(' '));
for (const ta of [a.title, a.title_ru, a.title_en].filter(Boolean))
  for (const tb of [b.title, b.title_ru, b.title_en].filter(Boolean)) {
    const A = abbrevWords(ta), B = new Set(abbrevWords(tb));
    const common = A.filter((w) => B.has(w));
    if (common.length) console.log('  pair', JSON.stringify(ta), '↔', JSON.stringify(tb), 'common:', common, 'core:', common.filter((w) => !addrWords.has(w)));
  }
console.log('verdict:', liveAbbrevMatch(a, b));
