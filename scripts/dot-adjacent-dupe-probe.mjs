// Зонд 3: дубли «одно событие — карточка на каждую дату» (агрегатор публикует
// многосерийное событие отдельной записью на каждый день). Признак: одинаковые
// title + city + описание (или пустое описание), разные даты в пределах 4 дней.
// Запуск: source .env && node scripts/dot-adjacent-dupe-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

const rows = (await selectAll(db, 'events', 'id, title, description, city, start_date, end_date, status, source_lang, website'))
  .filter((e) => e.status !== 'rejected');

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const day = (d) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86400000);

const groups = new Map();
for (const e of rows) {
  const k = `${norm(e.title)}|${norm(e.city)}|${norm(e.description).slice(0, 120)}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

let pairs = 0;
const lines = [];
for (const list of groups.values()) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = Math.abs(day(sorted[i].start_date) - day(sorted[i - 1].start_date));
    if (gap > 4) continue;
    pairs += 1;
    lines.push(
      `  ${sorted[i - 1].status}/${sorted[i].status} ${sorted[i - 1].start_date}→${sorted[i].start_date} (${gap} дн) ${sorted[i].id.slice(0, 8)} / ${sorted[i - 1].id.slice(0, 8)} | ${String(sorted[i].title).slice(0, 55)} | ${sorted[i].city} | ${sorted[i].website || '-'}`,
    );
  }
}

console.log(`Строк (кроме rejected): ${rows.length}`);
console.log(`Пар «соседние даты, тот же текст»: ${pairs}`);
console.log(lines.slice(0, 60).join('\n'));
