import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,lat,lng,start_date,start_time,status,website,created_at');
const SINCE = '2026-10-09T04:40:00Z';
const win = all.filter(r => r.created_at >= SINCE);
console.log('новых строк окна', win.length, '| всего', all.length, '| active', all.filter(r=>r.status==='active').length, '| moderation', all.filter(r=>r.status==='moderation').length);

// 1) у архивных окна — есть ли живой близнец (по названию+дате, и по адресу/времени)
const arch = win.filter(r => r.status === 'archived');
console.log('--- архивных в окне:', arch.length);
for (const a of arch) {
  const key = (a.title || '').toLowerCase().trim();
  const twins = all.filter(r => r.id !== a.id && (r.title_ru || r.title || '').toLowerCase().trim() === key && r.start_date === a.start_date);
  console.log(a.id.slice(0,8), a.start_time, a.title.slice(0,45), '=> близнецов', twins.length,
    twins.map(t => `${t.id.slice(0,8)}[${t.status}]${t.start_time}`).join(' '));
}
// 2) живые строки окна на центровых фолбэках
const FALL = { 'Никосия': [35.1856,33.3823], 'Лимасол': [34.7071,33.0226], 'Пафос': [34.7754,32.4245], 'Ларнака': [34.9182,33.6194], 'Фамагуста': [35.1205,33.9432], 'Нячанг': [12.2388,109.1967], 'Дананг': [16.0471,108.2062] };
console.log('--- живые окна на фолбэках:');
for (const r of win.filter(r => ['active','moderation'].includes(r.status))) {
  for (const [c,[la,ln]] of Object.entries(FALL)) {
    if ((r.city||'').startsWith(c) && r.lat != null && Math.abs(r.lat-la) < 0.0012 && Math.abs(r.lng-ln) < 0.0012) {
      console.log(r.id.slice(0,8), r.status, r.city, r.start_date, r.lat, r.lng, '| адр=', r.address, '|', (r.title_ru||r.title||'').slice(0,40));
    }
  }
}
// 3) адрес-мусор в окне
console.log('--- адреса окна:', win.filter(r=>r.address).map(r => `${r.id.slice(0,8)}:${r.address.slice(0,30)}`).join(' ; '));
