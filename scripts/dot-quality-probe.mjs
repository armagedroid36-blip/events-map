// Диагностика качества карточек: пробелы по полям у active + разбор очереди.
// Запуск из корня репозитория: node --env-file=.env scripts/dot-quality-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(
  db,
  'events',
  'id,status,title,start_date,start_time,end_date,city,address,lat,lng,photos,source_type,auto_review,website,created_at',
);

const act = rows.filter((r) => r.status === 'active');
console.log('всего', rows.length, '| active', act.length);
const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const miss = (f) => act.filter((r) => empty(r[f])).length;
for (const f of ['start_date', 'start_time', 'city', 'address', 'lat', 'lng', 'photos', 'website']) {
  console.log(' ', f, 'пусто:', miss(f));
}

const noImg = act.filter((r) => !(r.photos || []).length);
const byCity = {};
for (const r of noImg) byCity[r.city] = (byCity[r.city] || 0) + 1;
console.log('без фото по городам:', JSON.stringify(Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 12)));

const bySrc = {};
for (const r of noImg) bySrc[r.source_type] = (bySrc[r.source_type] || 0) + 1;
console.log('без фото по источникам:', JSON.stringify(bySrc));
for (const r of noImg) console.log('  NOFOTO', r.id.slice(0, 8), r.source_type, r.city, r.start_date, (r.website || '').slice(0, 70), '|', (r.title || '').slice(0, 40));

const q = rows.filter((r) => ['moderation', 'needs_changes', 'rejected'].includes(r.status));
console.log('ОЧЕРЕДЬ', q.length);
for (const r of q) {
  const rev = r.auto_review || {};
  console.log(' ', r.status, r.start_date, r.city, r.id.slice(0, 8), String(rev.reason || rev.verdict || '').slice(0, 70), '|', (r.title || '').slice(0, 45));
}
