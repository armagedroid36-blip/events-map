// dot-events: разовый ремонт кипрских карточек с латинским городом («limassol, Кипр»).
// Правит только поле city (события не удаляются), список — на экран до записи.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_ANON_KEY;
const db = createClient(url, key);
const APPLY = process.argv.includes('--apply');

const RU = {
  limassol: 'Лимасол', lemesos: 'Лимасол', lemessos: 'Лимасол',
  nicosia: 'Никосия', lefkosia: 'Никосия', lefkosa: 'Никосия',
  larnaca: 'Ларнака', larnaka: 'Ларнака',
  paphos: 'Пафос', pafos: 'Пафос',
  'ayia napa': 'Ая-Напа', 'agia napa': 'Ая-Напа',
  protaras: 'Протарас', paralimni: 'Паралимни', famagusta: 'Фамагуста',
};

const rows = await selectAll(db, 'events', 'id,title,city,country,status', {
  filter: (q) => q.eq('country', 'cyprus'),
});
const bad = rows.filter((r) => /[a-z]/i.test(String(r.city || '')));
console.log('кипрских всего:', rows.length, '| с латиницей в city:', bad.length);
let fixed = 0;
for (const r of bad) {
  const head = String(r.city).split(',')[0].trim();
  const ru = RU[head.toLowerCase()];
  if (!ru) { console.log('  ПРОПУСК (нет в словаре):', r.id, '|', r.city, '|', (r.title || '').slice(0, 40)); continue; }
  const next = `${ru}, Кипр`;
  console.log(`  ${APPLY ? 'FIX' : '[dry]'} ${r.id} | ${r.city} -> ${next} | status ${r.status} | ${(r.title || '').slice(0, 40)}`);
  if (APPLY) {
    const { data: upd, error } = await db.from('events').update({ city: next }).eq('id', r.id).select('id');
    if (error) { console.error('  ошибка:', error.message); continue; }
    if (!upd || !upd.length) { console.error('  НЕ ИЗМЕНЕНО (RLS/0 строк):', r.id); continue; }
    fixed++;
  }
}
console.log(APPLY ? `исправлено: ${fixed}` : 'сухой прогон (--apply для записи)');
