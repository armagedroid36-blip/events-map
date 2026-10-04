// dot-events: разовый ремонт «латинских» городов Бали в поле city
// («Ubud, Bali» рядом с «Убуд, Bali» расщепляет фильтр по городу на карте).
// Правит только поле city. Сухой прогон по умолчанию, запись с --apply.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
const db = createClient(url, key);
const APPLY = process.argv.includes('--apply');

// латинское написание района -> русский канон, принятый в базе
const RU = {
  ubud: 'Убуд',
  jimbaran: 'Джимбаран',
  canggu: 'Чангу',
  canngu: 'Чангу',
  seminyak: 'Семиньяк',
  kuta: 'Кута',
  sanur: 'Санур',
  pecatu: 'Печату (Улувату)',
  uluwatu: 'Улувату',
  denpasar: 'Денпасар',
  'nusa dua': 'Нуса-Дуа',
  nusadua: 'Нуса-Дуа',
  benoa: 'Беноа (Нуса Дуа)',
  'benoa (nusa dua)': 'Беноа (Нуса Дуа)',
  tabanan: 'Табанан',
  amed: 'Амед',
  sidemen: 'Сидемен',
  lovina: 'Ловина',
};

const rows = await selectAll(db, 'events', 'id,title,city,country,status,source_type');
const bad = rows.filter((r) => r.city && /^[A-Za-z]/.test(String(r.city).trim()));
console.log('всего строк:', rows.length, '| city начинается с латиницы:', bad.length);
let fixed = 0, skip = 0;
for (const r of bad) {
  const [headRaw, ...rest] = String(r.city).split(',');
  const head = headRaw.trim();
  const ru = RU[head.toLowerCase()];
  if (!ru) { skip++; console.log('  ПРОПУСК:', r.id, '|', r.city, '|', r.status, '|', r.source_type, '|', (r.title || '').slice(0, 45)); continue; }
  const tail = rest.join(',').trim() || 'Bali';
  const next = `${ru}, ${tail}`;
  console.log(`  ${APPLY ? 'FIX' : '[dry]'} ${r.id} | ${r.city} -> ${next} | ${r.status} | ${r.source_type} | ${(r.title || '').slice(0, 45)}`);
  if (APPLY) {
    const { data: upd, error } = await db.from('events').update({ city: next }).eq('id', r.id).select('id');
    if (error) { console.error('  ошибка:', error.message); continue; }
    if (!upd || !upd.length) { console.error('  НЕ ИЗМЕНЕНО (RLS/0 строк):', r.id); continue; }
    fixed++;
  }
}
console.log('исправлено:', fixed, '| вне словаря:', skip);

const again = await selectAll(db, 'events', 'id,city');
const left = again.filter((r) => r.city && /^[A-Za-z]/.test(String(r.city).trim()) && RU[String(r.city).split(',')[0].trim().toLowerCase()]);
console.log('контроль: осталось латинских из словаря Бали', left.length, left.map((r) => r.city).join(' | '));
