// Разбор ложной склейки прогона 38024912841: два РАЗНЫХ концерта программы
// «Διεθνές Φεστιβάλ Λευκωσίας 2026» (24.10 19:00, Nicosia Municipal Theatre)
// склеены правилом liveDupeMatch из-за одинакового адреса и общих слов фестиваля.
// Читающий: печатает псевдонимы, общие слова по лучшей паре, вердикт ключа.
import { createClient } from '@supabase/supabase-js';
import { liveDupeMatch, overlap, aliases, words, samePlace } from './live-dupe-key.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const IDS = ['73772a15', 'd1fe83d0'];

const { data: all, error } = await db.from('events').select('*')
  .eq('start_date', '2026-10-24').ilike('city', '%Никосия%');
if (error) { console.error('ERR', error.message); process.exit(1); }
const rows = IDS.map((p) => all.find((r) => r.id.startsWith(p))).filter(Boolean);
if (rows.length !== 2) { console.error('не нашёл обе карточки:', rows.length); process.exit(1); }

for (const r of rows) {
  console.log('\n===', r.id.slice(0, 8), r.status, '===', r.start_date, r.start_time);
  console.log('  city:', r.city, '| адрес:', JSON.stringify(r.address), '| пин:', r.lat + ',' + r.lng);
  for (const a of aliases(r)) console.log('  alias:', JSON.stringify(a));
}

const [a, b] = rows;
console.log('\noverlap:', overlap(a, b), '| samePlace:', samePlace(a, b));
for (const wa of aliases(a)) for (const wb of aliases(b)) {
  const sb = new Set(words(wb));
  const common = [...new Set(words(wa))].filter((w) => sb.has(w));
  if (common.length) console.log('  общие слова:', common.join(', '), '| A:', JSON.stringify(wa.slice(0, 70)), '| B:', JSON.stringify(wb.slice(0, 70)));
}
console.log('\nвердикт liveDupeMatch:', liveDupeMatch(a, b));
