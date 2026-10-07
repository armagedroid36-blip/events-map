// Срез качества живых карточек: без координат / с прошедшей датой / без города / без фото.
// Запуск из корня: node --env-file=.env scripts/dot-quality-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const rows = await selectAll(
  db,
  'events',
  'id,status,title,start_date,start_time,end_date,end_time,city,address,lat,lng,source_type,website,recurrence,created_at,photos',
);
const act = rows.filter((r) => r.status === 'active');
const empty = (v) => v === null || v === undefined || v === '';
console.log('events', rows.length, '| active', act.length);

const noGeo = act.filter((r) => empty(r.lat) || empty(r.lng));
const noCity = act.filter((r) => empty(r.city));
// Фото в таблице живут в колонке photos (массив), а не в несуществующей image_url:
// прежний select тянул несуществующее поле -> r.image_url всегда undefined -> ложные «1083 без фото».
const noImg = act.filter((r) => !(Array.isArray(r.photos) && r.photos.filter(Boolean).length));
const noTitle = act.filter((r) => empty(r.title) || (r.title || '').trim().length < 4);

const today = new Date().toISOString().slice(0, 10);
const past = act.filter((r) => {
  const end = r.end_date || r.start_date;
  return end && end < today;
});

const byCity = {};
for (const r of act) byCity[r.city || '(нет)'] = (byCity[r.city || '(нет)'] || 0) + 1;

console.log('БЕЗ КООРДИНАТ:', noGeo.length);
for (const r of noGeo)
  console.log(' ', r.id.slice(0, 8), r.start_date, '|', (r.city || '-'), '|', (r.source_type || ''), '|', (r.website || '').slice(0, 70), '|', (r.title || '').slice(0, 40));
console.log('ПРОШЕДШАЯ ДАТА (active!):', past.length);
const hasRec = (r) => {
  const x = r.recurrence;
  if (!x) return false;
  if (typeof x === 'string') return x.trim() !== '' && x.trim() !== '{}' && x.trim() !== 'null';
  return Object.keys(x).length > 0;
};
const pastNoRec = past.filter((r) => !hasRec(r));
const pastRec = past.filter(hasRec);
console.log('  из них БЕЗ правила повтора (кандидаты на дефект archive-past):', pastNoRec.length, '| с повтором:', pastRec.length);
for (const r of pastNoRec)
  console.log('   !', r.id.slice(0, 8), r.start_date, '..', r.end_date || '-', '|', (r.city || '-'), '|', (r.source_type || ''), '|', (r.title || '').slice(0, 40));
console.log('БЕЗ ГОРОДА:', noCity.length, '| БЕЗ ФОТО:', noImg.length, '| БЕЗ НАЗВАНИЯ:', noTitle.length);
console.log('города:', JSON.stringify(byCity));
