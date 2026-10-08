// Читающий зонд: перепись «артефактов текста» в полях живых карточек.
// Класс: в title/description/address уехали HTML-теги, HTML-сущности (&amp; &nbsp; &#39;),
// экранированные последовательности (\n, \uXXXX), служебные undefined/null/[object Object],
// невидимые символы (zero-width, NBSP), двойные пробелы.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const FIELDS = [
  'title', 'title_ru', 'title_en',
  'description', 'description_ru', 'description_en',
  'address',
];
const rows = await selectAll(
  db,
  'events',
  ['id', 'city', 'status', 'source_type', 'website', ...FIELDS].join(','),
  { filter: (q) => q.in('status', ['active', 'moderation']) },
);

const CHECKS = [
  ['HTML-тег', /<\s*\/?\s*[a-zA-Z!][^>]{0,120}>/],
  ['HTML-сущность', /&(?:[a-zA-Z]{2,10}|#\d{2,6});/],
  ['escaped-последовательность', /\\[ntru"']|\\u[0-9a-fA-F]{4}/],
  ['служебная строка', /\b(undefined|null|NaN|\[object Object\])\b/],
  ['zero-width space (U+200B)', /\u200b/],
  ['BOM/word-joiner (U+FEFF/2060)', /[\ufeff\u2060]/],
  ['L/RLM (U+200E/200F)', /[\u200e\u200f]/],
  ['мягкий перенос (U+00AD)', /\u00ad/],
  ['nbsp', /\u00a0/],
  ['двойной пробел', / {2,}/],
  ['перенос строки', /\n/],
];

console.log(`ЖИВЫХ (active+moderation): ${rows.length}`);
const total = new Map();
for (const [name] of CHECKS) total.set(name, []);

for (const r of rows) {
  for (const f of FIELDS) {
    const v = r[f];
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (!s.trim()) continue;
    for (const [name, re] of CHECKS) {
      if (re.test(s)) total.get(name).push({ id: String(r.id).slice(0, 8), f, city: r.city, src: r.source_type, s });
    }
  }
}

for (const [name] of CHECKS) {
  const hit = total.get(name);
  const byField = {};
  for (const h of hit) byField[h.f] = (byField[h.f] || 0) + 1;
  const fb = Object.entries(byField).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`\n«${name}»: ${hit.length}${fb ? '  (' + fb + ')' : ''}`);
  const seen = new Set();
  const ordered = [...hit].sort((a, b) => (a.f.startsWith('title') || a.f === 'address' ? -1 : 1) - (b.f.startsWith('title') || b.f === 'address' ? -1 : 1));
  for (const h of ordered) {
    if (seen.size >= 6) break;
    const key = h.id + h.f;
    if (seen.has(key)) continue;
    seen.add(key);
    const body = h.f.startsWith('title') || h.f === 'address' ? h.s.slice(0, 200) : h.s.slice(0, 150);
    console.log(`   ${h.id} [${h.src}] ${h.city} | ${h.f} | ${JSON.stringify(body)}`);
  }
}
