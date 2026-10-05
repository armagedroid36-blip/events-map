// Проверка класса «одна страница Cyprus.BZ живёт под двумя слагами (ru/en)».
// Читает все `website` из базы, схлопывает их в канонический ключ
// host + /event/<id>/ и показывает группы, где одному событию соответствуют
// два и более разных URL — это и есть копии, которые не видит normKey(title|start_date).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { canonBzPage } from './collect-cyprus.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// 1) Юнит-проверка канонизации на реальных формах ссылок.
const cases = [
  ['https://cyprus.bz/ru/event/33c4/rantevou-stin-plateia', 'cyprus.bz/event/33c4'],
  ['https://cyprus.bz/en/event/33c4/rendezvous-on-the-square', 'cyprus.bz/event/33c4'],
  ['https://cyprus.bz/event/321d/limassol-fashion-show-2026', 'cyprus.bz/event/321d'],
  ['https://cyprus.bz/events/ayia-napa', null],
  ['https://cyprusnow.app/event/race-for-the-cure', null],
];
let bad = 0;
for (const [input, want] of cases) {
  const got = canonBzPage(input);
  if (got !== want) { bad++; console.log(`  ПРОВАЛ канон: ${input} -> ${got}, ждали ${want}`); }
}
console.log(`Юнит-канон: провалов ${bad} из ${cases.length}`);

// 2) Сверка по базе.
const rows = await selectAll(db, 'events', 'id,status,website,title,start_date');
const groups = new Map();
for (const r of rows) {
  const key = canonBzPage(r.website);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
let withDup = 0;
let dupRows = 0;
for (const [key, list] of groups) {
  const urls = new Set(list.map((r) => (r.website || '').trim()));
  if (urls.size > 1) {
    withDup++;
    dupRows += list.length;
    if (withDup <= 8) {
      console.log(`  ${key}: ${list.length} строк, ${urls.size} разных URL`);
      for (const r of list) {
        console.log(`     ${r.id.slice(0, 8)} [${r.status}] ${r.start_date} ${(r.title || '').slice(0, 36)} | ${r.website}`);
      }
    }
  }
}
const live = rows.filter((r) => r.status === 'active' || r.status === 'moderation').length;
console.log(`База: строк ${rows.length} (живых ${live}), ссылок cyprus.bz /event/ — ${[...groups.values()].reduce((a, l) => a + l.length, 0)}, канонических страниц ${groups.size}`);
console.log(`Копий (одна страница под разными URL): ${withDup} групп, ${dupRows} строк`);
