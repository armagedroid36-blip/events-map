// Читающий зонд: сколько ЖИВЫХ карточек одного события, разложенного агрегатором
// по отдельным записям на каждый день (соседние даты + тот же текст).
// Признак дефекта: >=2 живых (active/moderation/needs_changes) карточки одной
// группы title|city|description с датами в пределах 4 дней.
// Запуск: node --env-file=.env scripts/dot-adjacent-live-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);

const LIVE = new Set(['active', 'moderation', 'needs_changes']);
const today = new Date().toISOString().slice(0, 10);

const rows = (
  await selectAll(
    db,
    'events',
    'id, title, description, city, address, start_date, end_date, start_time, status, recurrence, website',
  )
).filter((e) => LIVE.has(e.status));

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
let future = 0;
for (const list of groups.values()) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = Math.abs(day(sorted[i].start_date) - day(sorted[i - 1].start_date));
    if (gap > 4) continue;
    pairs += 1;
    const isFuture = sorted[i].start_date >= today || sorted[i - 1].start_date >= today;
    if (isFuture) future += 1;
    lines.push(
      `${isFuture ? 'БУДУЩ' : 'прошл'} ${sorted[i - 1].status}/${sorted[i].status} ` +
        `${sorted[i - 1].start_date}→${sorted[i].start_date} (${gap} дн) ` +
        `${sorted[i].id.slice(0, 8)}/${sorted[i - 1].id.slice(0, 8)} | ` +
        `${String(sorted[i].title).slice(0, 60)} | ${sorted[i].city} | ${sorted[i].website || '-'}`,
    );
  }
}

console.log(`Живых карточек: ${rows.length} (active/moderation/needs_changes), сегодня ${today}`);
console.log(`Пар «соседние даты, тот же текст»: ${pairs}, из них с будущей датой: ${future}`);
console.log(lines.filter((l) => l.startsWith('БУДУЩ')).slice(0, 40).join('\n'));
