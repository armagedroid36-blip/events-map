// Точка «События»: сводная перепись КАЧЕСТВА живых карточек (то, что не мерилось
// в прошлых запусках): пустые поля, инверсии дат, «прошедшая» дата у active,
// отсутствие русского названия, координаты вне геофокуса. Только чтение.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,title_en,description,city,address,country,lat,lng,status,start_date,start_time,end_date,end_time,recurrence,source_type,website,photos,created_at');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
const today = new Date().toISOString().slice(0, 10);
console.log('Всего строк', rows.length, '| живых', live.length, '| сегодня', today);

const by = (fn) => {
  const m = new Map();
  for (const r of live) { const k = fn(r) || '(нет)'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const list = (name, arr, fn, limit = 12) => {
  console.log(`\n== ${name}: ${arr.length}`);
  if (arr.length && fn) for (const r of arr.slice(0, limit)) console.log('   ' + fn(r));
};

list('без title_ru', live.filter((r) => !r.title_ru), (r) => `${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${(r.title || '').slice(0, 70)}`);
list('без title_ru И без title_en', live.filter((r) => !r.title_ru && !r.title_en), (r) => `${r.id.slice(0, 8)} ${r.city} | ${(r.title || '').slice(0, 70)}`);
list('без описания', live.filter((r) => !r.description || String(r.description).trim().length < 10), null);
list('без адреса', live.filter((r) => !r.address || !String(r.address).trim()), (r) => `${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${(r.title || '').slice(0, 50)} | ${(r.website || '').slice(0, 50)}`);
list('без ссылки', live.filter((r) => !r.website), (r) => `${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${(r.title || '').slice(0, 60)}`);
list('без фото', live.filter((r) => !Array.isArray(r.photos) || r.photos.length === 0), (r) => `${r.id.slice(0, 8)} [${r.status}] ${r.city} | ${(r.title || '').slice(0, 55)}`);
list('без времени начала (start_time null)', live.filter((r) => !r.start_time), (r) => `${r.id.slice(0, 8)} [${r.status}] ${r.source_type} ${r.city} | ${r.start_date} | ${(r.title || '').slice(0, 50)}`);
list('end_date РАНЬШЕ start_date', live.filter((r) => r.end_date && r.end_date < r.start_date), (r) => `${r.id.slice(0, 8)} ${r.city} | ${r.start_date} -> ${r.end_date} | ${(r.title || '').slice(0, 50)}`);
list('end_date дальше года вперёд', live.filter((r) => r.end_date && r.end_date > new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)), (r) => `${r.id.slice(0, 8)} ${r.city} | ${r.start_date} -> ${r.end_date} | ${(r.title || '').slice(0, 50)}`);
list('start_date в прошлом у active, без recurrence', live.filter((r) => r.status === 'active' && r.start_date < today && !r.recurrence), (r) => `${r.id.slice(0, 8)} ${r.city} | ${r.start_date} | ${(r.title || '').slice(0, 55)}`);
list('start_date дальше 180 дней', live.filter((r) => r.start_date > new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10)), (r) => `${r.id.slice(0, 8)} ${r.city} | ${r.start_date} | ${(r.title || '').slice(0, 55)}`);
list('без координат', live.filter((r) => r.lat == null || r.lng == null), null);
list('без города', live.filter((r) => !r.city), null);
const outOfBounds = live.filter((r) => r.lat != null && !((r.lat > -12 && r.lat < 40 && r.lng > 90 && r.lng < 140) || (r.lat > 30 && r.lat < 40 && r.lng > 25 && r.lng < 45)));
list('координаты вне геофокуса', outOfBounds, (r) => `${r.id.slice(0, 8)} ${r.city} | ${r.lat},${r.lng} | ${(r.title || '').slice(0, 50)}`);
console.log('\n== по source_type:', JSON.stringify(by((r) => r.source_type)));
console.log('== по статусу:', JSON.stringify(by((r) => r.status)));
