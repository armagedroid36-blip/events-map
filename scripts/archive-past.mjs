// Архивация прошедших событий: active, у которых событие уже закончилось → archived.
// Условие: (end_date < сегодня) ИЛИ (end_date пусто И start_date < сегодня).
// Запускается в GitHub Actions после сборки, чтобы на карте не висели прошедшие.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const ids = new Set();

  // 1) Есть end_date и он в прошлом
  const { data: byEnd, error: e1 } = await db
    .from('events')
    .select('id')
    .eq('status', 'active')
    .lt('end_date', today);
  if (e1) {
    console.error('Ошибка выборки по end_date:', e1.message);
  }
  (byEnd || []).forEach((r) => ids.add(r.id));

  // 2) end_date нет, start_date в прошлом (бессрочные регулярные НЕ архивируются)
  const { data: byStart, error: e2 } = await db
    .from('events')
    .select('id')
    .eq('status', 'active')
    .is('end_date', null)
    .is('recurrence', null)
    .lt('start_date', today);
  if (e2) {
    console.error('Ошибка выборки по start_date:', e2.message);
  }
  (byStart || []).forEach((r) => ids.add(r.id));

  if (!ids.size) {
    console.log('Прошедших активных событий нет.');
    return;
  }

  const { error } = await db.from('events').update({ status: 'archived' }).in('id', [...ids]);
  if (error) {
    console.error('Ошибка архивации:', error.message);
    process.exit(1);
  }
  console.log(`Архивировано прошедших событий: ${ids.size}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
