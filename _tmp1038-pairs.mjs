import { createClient } from '@supabase/supabase-js';
import * as liveDupe from './scripts/live-dupe-key.mjs';
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { data, error } = await db.from('events')
  .select('id,title,title_ru,start_date,start_time,address,city,status,recurrence,description')
  .or('title.ilike.*BEYOND DISDANCE*,title.ilike.*Соло Латина*')
  .gte('start_date', '2026-11-01');
if (error) { console.error(error.message); process.exit(1); }
const cards = data.filter(e => e.status !== 'archived');
console.log('живых карточек темы:', cards.length);
const pairs = [];
for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
  const a = cards[i], b = cards[j];
  const r = liveDupe.liveDupeMatch(a,b) || liveDupe.liveAbbrevMatch(a,b) || liveDupe.liveLangPlaceMatch(a,b) || liveDupe.liveCrossSourceMatch(a,b);
  if (r) pairs.push([a,b,r]);
}
console.log('пар по live-правилам:', pairs.length);
for (const [a,b,r] of pairs) {
  console.log('----', r);
  console.log('  A', a.status, a.start_date, a.start_time, a.id.slice(0,8), a.title.slice(0,60), '| rec=', JSON.stringify(a.recurrence));
  console.log('  B', b.status, b.start_date, b.start_time, b.id.slice(0,8), b.title.slice(0,60), '| rec=', JSON.stringify(b.recurrence));
  const w1 = new Set(liveDupe.words(a.title_ru||a.title)), w2 = new Set(liveDupe.words(b.title_ru||b.title));
  console.log('  общие слова:', [...w1].filter(x=>w2.has(x)).join(', '));
}
