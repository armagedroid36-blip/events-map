// Класс «время-заглушка 23:59»: сверка живых карточек с лентой источника.
// Гипотеза: 23:59 у Балифорума = «время не указано» (весь день), а не реальное начало.
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const cachePath = path.join(os.tmpdir(), 'bali-feed-cache.json');
let feed = [];
if (existsSync(cachePath)) {
  feed = JSON.parse(readFileSync(cachePath, 'utf8'));
  console.log('лента из кэша:', feed.length);
} else {
  for (let page = 1; page <= 6; page++) {
    let d;
    try {
      const out = execSync(`curl -s -x http://127.0.0.1:10809 --max-time 25 "https://baliforum.ru/api/v1/events?defaultList=1&page=${page}"`, { maxBuffer: 1 << 28 });
      d = JSON.parse(out.toString('utf8'));
    } catch (e) { console.log('FEED ERR p' + page, e.message.slice(0, 100)); break; }
    const evs = d.data || [];
    if (!evs.length) break;
    feed.push(...evs);
  }
  writeFileSync(cachePath, JSON.stringify(feed));
  console.log('лента читана:', feed.length);
}
const bySlug = new Map();
for (const e of feed) {
  const ds = (e.eventDates || []).map((x) => String(x.startAt));
  if (!bySlug.has(e.slug)) bySlug.set(e.slug, { title: e.title, times: ds.slice(0, 30), fields: Object.keys(e).slice(0, 40) });
}

// распределение времени начала по всей ленте
const timeHist = new Map();
for (const e of feed) for (const d of e.eventDates || []) {
  const hhmm = String(d.startAt).slice(11, 16);
  timeHist.set(hhmm, (timeHist.get(hhmm) || 0) + 1);
}
const top = [...timeHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('частота времён в ленте (топ-12):', top.map(([t, n]) => `${t}:${n}`).join(' '));

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,city,start_date,start_time,status,website');
const live = all.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const stub = live.filter((r) => String(r.start_time || '').startsWith('23:59'));
const grp = new Map();
let matched = 0, feedStub = 0, feedReal = 0, noSlug = 0;
for (const r of stub) {
  const host = (() => { try { return new URL(r.website).host; } catch { return 'нет'; } })();
  grp.set(host, (grp.get(host) || 0) + 1);
  if (host !== 'baliforum.ru') continue;
  const slug = String(r.website).split('/events/')[1] || '';
  const f = bySlug.get(slug);
  if (!f) { noSlug++; continue; }
  matched++;
  const t0 = f.times[0]?.slice(11, 16);
  if (t0 === '23:59') feedStub++; else { feedReal++; console.log('  ЛЕНТА ДАЁТ ДРУГОЕ:', r.id.slice(0, 8), slug, f.times.slice(0, 3).join(',')); }
}
console.log(`карточек с start_time 23:59: ${stub.length}`);
console.log('их хосты:', [...grp.entries()].map(([h, n]) => `${h}:${n}`).join(' '));
console.log(`балифорумских сверено ${matched}: лента тоже 23:59 — ${feedStub}, лента даёт другое — ${feedReal}, слага в ленте нет — ${noSlug}`);
if (feed.length) {
  const sample = [...bySlug.entries()].find(([s]) => s.includes('savaya-wednesday-v-savaya-bali-1'));
  console.log('поля записи ленты:', sample ? sample[1].fields.join(',') : 'нет');
}
