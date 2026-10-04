// dot-events: класс «кросс-статусные пары» (одно событие в active и в needs_changes/moderation/rejected).
// Ключ мягкий: title|start_date по любому псевдониму названия (title/title_ru/title_en).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('нет ключей env'); process.exit(1); }
const db = createClient(url, key);

const rows = await selectAll(db, 'events',
  'id,title,title_ru,title_en,status,start_date,end_date,start_time,city,address,lat,lng,website,source_type,created_at');

console.log('строк всего:', rows.length);
const byStatus = {};
for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('статусы:', JSON.stringify(byStatus));

const LIVE = new Set(['active']);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ключи: для каждой строки — набор {alias|date}
const groups = new Map(); // key -> [rows]
for (const r of rows) {
  const aliases = new Set([norm(r.title), norm(r.title_ru), norm(r.title_en)].filter(Boolean));
  const date = String(r.start_date || '').slice(0, 10);
  if (!date) continue;
  for (const a of aliases) {
    const k = a + '|' + date;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
}

// ищем пары, где есть >=1 active и >=1 не-active (moderation/needs_changes/rejected/archived)
const pairs = new Map(); // activeId|otherId -> {a, o, keys}
for (const [k, list] of groups) {
  const act = list.filter((r) => LIVE.has(r.status));
  const oth = list.filter((r) => !LIVE.has(r.status) && r.status !== 'archived');
  for (const a of act) for (const o of oth) {
    if (a.id === o.id) continue;
    const pid = a.id + '|' + o.id;
    if (!pairs.has(pid)) pairs.set(pid, { a, o, keys: [] });
    pairs.get(pid).keys.push(k);
  }
}
console.log('\nкросс-статусных пар (active ↔ не-active, ключ название|дата):', pairs.size);
const out = [];
for (const { a, o, keys } of pairs.values()) {
  const sameAddr = norm(a.address) && norm(a.address) === norm(o.address);
  const nearGeo = a.lat && o.lat && Math.abs(a.lat - o.lat) < 1e-4 && Math.abs(a.lng - o.lng) < 1e-4;
  out.push({ a: a.id, o: o.id, ost: o.status, title: a.title_ru || a.title, date: a.start_date, keys: keys.length, sameAddr, nearGeo });
}
out.sort((x, y) => (y.sameAddr ? 1 : 0) - (x.sameAddr ? 1 : 0));
for (const p of out.slice(0, 40)) {
  console.log(`${p.a} [active] / ${p.o} [${p.ost}] | ${p.date} | ${p.title.slice(0, 60)} | addr=${p.sameAddr} geo=${p.nearGeo} keys=${p.keys}`);
}
console.log('\nвсего выведено:', Math.min(40, out.length), 'из', out.length);
