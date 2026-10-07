// Точка «События»: перепись времени у живых карточек (класс «время как данные»).
// Считает: без start_time, placeholder 00:00, ночные 00:xx-04:xx, битый формат,
// end_date раньше start_date, дата без года/битая.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,start_time,end_date,recurrence,source_type,website,created_at');
const live = rows.filter((r) => r.status !== 'archived');

const norm = (t) => (t || '').trim();
const noTime = live.filter((r) => !norm(r.start_time));
const midnight = live.filter((r) => /^00:00(:00)?$/.test(norm(r.start_time)));
const night = live.filter((r) => {
  const m = norm(r.start_time).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const h = +m[1];
  return h >= 1 && h <= 4;
});
const badFmt = live.filter((r) => norm(r.start_time) && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(norm(r.start_time)));
const badDate = live.filter((r) => norm(r.start_date) && !/^\d{4}-\d{2}-\d{2}$/.test(norm(r.start_date)));
const endBefore = live.filter((r) => norm(r.end_date) && norm(r.start_date) && norm(r.end_date) < norm(r.start_date));

console.log('живых', live.length);
console.log('без start_time', noTime.length, '| 00:00 placeholder', midnight.length, '| 01:00-04:59', night.length,
  '| битый формат времени', badFmt.length, '| битая дата', badDate.length, '| end_date < start_date', endBefore.length);

const show = (label, arr) => {
  if (!arr.length) return;
  console.log('--- ' + label);
  for (const r of arr) {
    console.log([r.id.slice(0, 8), r.status, r.city || '—', r.start_date || '-', r.start_time || '-', r.end_date || '-',
      r.recurrence || '-', (r.title_ru || r.title || '').slice(0, 45), (r.source_type || '').slice(0, 9),
      (r.website || '-').slice(0, 55), r.created_at.slice(0, 16)].join(' | '));
  }
};
show('без start_time', noTime);
show('00:00 placeholder', midnight);
show('ночные 01:00-04:59', night);
show('битый формат', badFmt);
show('битая дата', badDate);
show('end_date < start_date', endBefore);
