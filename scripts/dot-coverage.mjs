// dot-coverage.mjs — срез покрытия активных событий по городам геофокуса
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const rows = await selectAll(db, 'events', 'id,city,country,status,start_date,created_at,website', { filter: (q) => q.eq('status', 'active') });
console.log('active rows read:', rows.length);

const byCity = new Map();
for (const r of rows) {
  const c = (r.city || '(нет города)').trim();
  byCity.set(c, (byCity.get(c) || 0) + 1);
}
const focus = ['Бали', 'Bali', 'Убуд', 'Ubud', 'Чангу', 'Canggu', 'Семиньяк', 'Seminyak', 'Улувату', 'Uluwatu', 'Санур', 'Sanur', 'Кута', 'Kuta', 'Дананг', 'Da Nang', 'Нячанг', 'Nha Trang', 'Лимасол', 'Limassol', 'Никосия', 'Nicosia', 'Ларнака', 'Larnaca', 'Пафос', 'Paphos', 'Ая-Напа', 'Ayia Napa', 'Протарас', 'Protaras', 'Паралимни', 'Paralimni', 'Фамагуста', 'Famagusta'];
console.log('--- геофокус ---');
for (const f of focus) if (byCity.has(f)) console.log(f.padEnd(14), byCity.get(f));

console.log('--- топ-12 городов по количеству ---');
[...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([c, n]) => console.log(String(n).padStart(5), c));

// свежие за 3 суток — кто пополняется
const since = new Date(Date.now() - 3 * 86400e3).toISOString();
const fresh = rows.filter(r => (r.created_at || '') > since);
const freshBy = new Map();
for (const r of fresh) { const c = (r.city || '?').trim(); freshBy.set(c, (freshBy.get(c) || 0) + 1); }
console.log('--- создано за 3 суток:', fresh.length, '---');
[...freshBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => console.log(String(n).padStart(5), c));
