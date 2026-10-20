// Зонд: КАЧЕСТВО строк последнего окна прогона сбора (по created_at).
// Считает живые карточки окна и дефекты заполнения: нет city / координат / адреса /
// даты / категории / ссылки; ссылка ведёт на КОРЕНЬ сайта (isRootUrl из site-url.mjs —
// path '/' или пусто И без query/hash, поэтому https://x/?p=1 корнем НЕ считается).
// Печатает распределение по источникам и список дефектных карточек. Норма — 0, кроме
// известного класса «пост TG не даёт адрес».
// Использование: WINDOW=2026-10-20T09:34:29Z node --env-file=.env scripts/dot-window-quality-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isRootUrl } from './site-url.mjs';

const WINDOW = process.argv[2] || process.env.WINDOW || new Date(Date.now() - 12 * 3600e3).toISOString();
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const rows = await selectAll(db, 'events',
  'id,status,city,address,lat,lng,start_date,start_time,category_id,website,title,title_ru,created_at',
  { filter: q => q.gte('created_at', WINDOW) });

const short = r => String(r.id).slice(0, 8);
const host = r => { try { return new URL(r.website).hostname.replace(/^www\./, ''); } catch { return 'нет ссылки'; } };

console.log(`окно ${WINDOW}: новых строк ${rows.length}`);
const st = {};
for (const r of rows) st[r.status] = (st[r.status] || 0) + 1;
console.log('статусы:', JSON.stringify(st));

const live = rows.filter(r => r.status === 'active' || r.status === 'moderation');
const defects = [];
for (const r of live) {
  const d = [];
  if (!r.city) d.push('нет city');
  if (r.lat == null || r.lng == null) d.push('нет координат');
  if (!r.address) d.push('нет адреса');
  if (!r.start_date) d.push('нет даты');
  if (!r.category_id) d.push('нет категории');
  if (!r.website) d.push('нет ссылки');
  else if (isRootUrl(r.website)) d.push('ссылка на корень: ' + r.website);
  if (d.length) defects.push({ id: short(r), status: r.status, d, title: (r.title_ru || r.title || '').slice(0, 60), why: d.join(', ') });
}
console.log(`живых из окна: ${live.length}; дефектных: ${defects.length}`);
defects.forEach(x => console.log(`  ${x.id} [${x.status}] ${x.why} | ${x.title}`));

const byHost = {};
for (const r of live) byHost[host(r)] = (byHost[host(r)] || 0) + 1;
console.log('источники:', Object.entries(byHost).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} ${n}`).join(', '));
