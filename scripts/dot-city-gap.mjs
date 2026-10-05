// dot-city-gap.mjs — срез геофокуса: сколько АКТИВНЫХ ПРЕДСТОЯЩИХ событий в каждом городе/районе.
// Цель: увидеть «пустые» города карты (0 или почти 0 предстоящих), а не только топ по количеству.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,city,start_date,end_date,status,website,lat', { filter: (q) => q.eq('status', 'active') });

const today = new Date().toISOString().slice(0, 10);
// Города/районы геофокуса (канон city в базе).
const FOCUS = [
  // Бали
  'Кута', 'Легиан', 'Семиньяк', 'Керобокан', 'Печату (Улувату)', 'Унгасан', 'Джимбаран', 'Беноа (Нуса Дуа)',
  'Чангу', 'Печененган', 'Санур', 'Денпасар', 'Убуд', 'Сукавати', 'Табанан', 'Сидаме́н', 'Сидемен', 'Амед', 'Ловина', 'Мундук', 'Гианьяр',
  // Кипр
  'Лимасол, Кипр', 'Никосия, Кипр', 'Ларнака, Кипр', 'Пафос, Кипр', 'Ая-Напа, Кипр', 'Протарас, Кипр',
  'Паралимни, Кипр', 'Фамагуста, Кипр', 'Полис, Кипр',
  // Вьетнам
  'Дананг', 'Нячанг',
];

const stat = new Map();
for (const r of rows) {
  const c = (r.city || '(нет города)').trim();
  if (!stat.has(c)) stat.set(c, { total: 0, upcoming: 0, noGeo: 0 });
  const s = stat.get(c);
  s.total++;
  const end = r.end_date || r.start_date;
  if (end && end >= today) s.upcoming++;
  if (!r.lat) s.noGeo++;
}

console.log('=== геофокус: предстоящих / всего / без координат ===');
const lines = [];
for (const c of FOCUS) {
  const s = stat.get(c);
  lines.push([c, s ? s.upcoming : 0, s ? s.total : 0, s ? s.noGeo : 0]);
}
lines.sort((a, b) => a[1] - b[1]);
for (const [c, up, tot, ng] of lines) console.log(String(up).padStart(5), '/', String(tot).padStart(4), '/', String(ng).padStart(3), ' ', c);

console.log('\n=== все города базы (предстоящих / всего) ===');
for (const [c, s] of [...stat.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(String(s.upcoming).padStart(5), '/', String(s.total).padStart(4), ' ', c);
}
