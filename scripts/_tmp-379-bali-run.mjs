// Замер класса «многодневная серия Балифорума свёрнута в один день» (запуск 379).
// Считает будущие «безвременные» записи (endAt = startAt = 23:59:59) по каждой записи ленты
// и сверяет с карточкой в базе: start_date/end_date.
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const PROXY = process.env.PROXY || 'http://127.0.0.1:10809';
const H = 3600000;
const now = Date.now();

function feed(page) {
  const out = execSync(
    `curl -s -x ${PROXY} --max-time 25 "https://baliforum.ru/api/v1/events?defaultList=1&page=${page}"`,
    { maxBuffer: 1 << 28 },
  );
  return JSON.parse(out.toString('utf8'));
}

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,start_date,end_date,city,status,website,recurrence');
const live = rows.filter((r) => r.status === 'active' || r.status === 'moderation');
const bySlug = new Map();
for (const r of live) {
  if (!r.website) continue;
  const m = String(r.website).match(/baliforum\.ru\/[^/]*\/?([^/?#]+)\/?$/);
  if (m) bySlug.set(m[1], r);
}

const buckets = new Map(); // len -> [{title, city, card}]
let feedTotal = 0;
for (let p = 1; p <= 6; p++) {
  const evs = feed(p).data || [];
  if (!evs.length) break;
  feedTotal += evs.length;
  for (const e of evs) {
    const ds = (e.eventDates || [])
      .map((d) => ({ s: new Date(d.startAt), e: d.endAt ? new Date(d.endAt) : null, raw: d }))
      .filter((d) => d.s.getTime() > now - 12 * H)
      .sort((a, b) => a.s - b.s);
    if (!ds.length) continue;
    const dateless = ds.filter((d) => !d.raw.endAt || String(d.raw.endAt).slice(0, 19) === String(d.raw.startAt).slice(0, 19));
    // непрерывный ряд безвременных записей от первой будущей
    let run = 0;
    for (const d of ds) {
      if (!dateless.includes(d)) break;
      run++;
    }
    if (run < 4) continue;
    const card = bySlug.get(e.slug);
    const key = String(run);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ title: e.title, slug: e.slug, card });
  }
}
console.log(`записей ленты просмотрено: ${feedTotal}; живых карточек с baliforum-ссылкой: ${bySlug.size}`);
for (const [len, list] of [...buckets.entries()].sort((a, b) => +a[0] - +b[0])) {
  console.log(`\n=== безвременных записей подряд: ${len} — ${list.length} событий`);
  for (const x of list.slice(0, 12)) {
    const c = x.card
      ? `${x.card.start_date}..${x.card.end_date || '-'} [${x.card.city}] ${x.card.status}`
      : 'НЕТ КАРТОЧКИ';
    console.log(`  ${len}д | ${String(x.title).slice(0, 55)} | ${c}`);
  }
  const noCard = list.filter((x) => !x.card).length;
  const oneDay = list.filter((x) => x.card && x.card.start_date === x.card.end_date).length;
  const multi = list.filter((x) => x.card && x.card.end_date && x.card.end_date > x.card.start_date).length;
  console.log(`  итог по группе: без карточки ${noCard}, однодневных карточек ${oneDay}, с диапазоном ${multi}`);
}
