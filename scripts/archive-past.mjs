// Архивация прошедших событий: active, у которых событие уже закончилось → archived.
// Условие: (end_date < сегодня) ИЛИ (end_date пусто И start_date < сегодня).
// Запускается в GitHub Actions после сборки, чтобы на карте не висели прошедшие.
// DRY_RUN=1 — только показать список кандидатов, ничего не менять.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === '1';
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const today = new Date().toISOString().slice(0, 10);

/** Есть ли у события РЕАЛЬНОЕ правило повтора.
 *  jsonb 'null' (JSON-null), SQL NULL и пустой объект — не правило: такие
 *  события архивируются как разовые. См. миграцию 20260912_recurrence_jsonb_null.sql. */
function hasRecurrence(rec) {
  return Boolean(rec && typeof rec === 'object' && !Array.isArray(rec) && typeof rec.freq === 'string' && rec.freq);
}

async function main() {
  // id → почему архивируем (для DRY_RUN-лога)
  const reasons = new Map();

  // 1) Есть end_date и он в прошлом
  const { data: byEnd, error: e1 } = await db
    .from('events')
    .select('id, title')
    .eq('status', 'active')
    .lt('end_date', today);
  if (e1) {
    console.error('Ошибка выборки по end_date:', e1.message);
  }
  (byEnd || []).forEach((r) => reasons.set(r.id, `end_date < ${today}`));

  // 2) end_date нет, start_date в прошлом (бессрочные регулярные НЕ архивируются).
  //    ПИТФОЛ: recurrence мог содержать jsonb 'null' (JSON-null, а не SQL NULL) —
  //    PostgREST-фильтр .is('recurrence', null) такие строки НЕ находит, и события
  //    с прошедшей датой копились активными (и висели в пре-рендере/sitemap).
  //    Поэтому читаем все строки без end_date, а правило повтора проверяем в JS.
  //    С 12.09.2026 писатели нормализуют JSON-null в SQL NULL (миграция
  //    20260912_recurrence_jsonb_null.sql, триггер events_recurrence_normalize),
  //    но проверка остаётся — на случай старых и внешних записей.
  const { data: byStart, error: e2 } = await db
    .from('events')
    .select('id, title, recurrence')
    .eq('status', 'active')
    .is('end_date', null)
    .lt('start_date', today);
  if (e2) {
    console.error('Ошибка выборки по start_date:', e2.message);
  }
  (byStart || [])
    .filter((r) => !hasRecurrence(r.recurrence))
    .forEach((r) => reasons.set(r.id, `start_date < ${today}, без правила повтора`));

  if (!reasons.size) {
    console.log('Прошедших активных событий нет.');
    return;
  }

  if (DRY_RUN) {
    console.log(`[dry] Прошедших активных событий: ${reasons.size}`);
    const titles = new Map([...(byEnd || []), ...(byStart || [])].map((r) => [r.id, r.title || '']));
    for (const [id, why] of reasons) {
      console.log(`[dry]   ${id.slice(0, 8)} | ${String(titles.get(id) || '').slice(0, 50)} | ${why}`);
    }
    return;
  }

  const { error } = await db.from('events').update({ status: 'archived' }).in('id', [...reasons.keys()]);
  if (error) {
    console.error('Ошибка архивации:', error.message);
    process.exit(1);
  }
  console.log(`Архивировано прошедших событий: ${reasons.size}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
