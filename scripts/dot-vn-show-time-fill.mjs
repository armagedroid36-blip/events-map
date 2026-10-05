// Заполнение start_time у вьетнамских шоу по проверенной странице-источнику
// danang365.com/vi/du-lich-da-nang-show-dien-2/ (данные со страницы, без догадок).
// Каждая запись: префикс id → { time, quote } — цитата со страницы-источника.
// Запуск: node --env-file=.env scripts/dot-vn-show-time-fill.mjs          (dry)
//         APPLY=1 node --env-file=.env scripts/dot-vn-show-time-fill.mjs  (запись)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const SRC = 'danang365.com/vi/du-lich-da-nang-show-dien-2/';
const TABLE = [
  { id: 'fdf56fce', time: '17:00', show: 'Charming Danang Show', quote: 'Thường diễn ra: 17:00 – 18:30' },
  { id: 'd6741792', time: '19:45', show: 'Hồn Việt Show', quote: 'Ngày thường: 19:45' },
  { id: '2ccf2a96', time: '20:00', show: 'Hội An Memories Show', quote: 'Biểu diễn chính: 20:00 – 21:00' },
];

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } },
);
const APPLY = process.env.APPLY === '1';
const rows = await selectAll(db, 'events', 'id,status,title,start_date,start_time,city,website,source_type');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));

// формат времени в базе — посмотреть на уже заполненной карточке
const ref = rows.find((r) => r.start_time);
console.log('образец start_time в базе:', JSON.stringify(ref ? ref.start_time : null));

let done = 0;
for (const t of TABLE) {
  const r = byId.get(t.id);
  if (!r) { console.log('НЕТ', t.id, t.show); continue; }
  if (r.start_time) { console.log('уже есть время', t.id, r.start_time, '|', (r.title || '').slice(0, 40)); continue; }
  const src = (r.website || '').includes('danang365') ? 'ok' : 'ЧУЖОЙ ИСТОЧНИК ' + (r.website || '');
  console.log((APPLY ? 'ЗАПИСЬ' : '[dry]'), t.id, r.status, r.city, r.start_date, '→', t.time, '| источник:', src, '|', t.quote);
  if (!APPLY || src !== 'ok') continue;
  const { data, error } = await db.from('events').update({ start_time: t.time }).eq('id', r.id).select('id,start_time');
  if (error) { console.log('  ОШИБКА', error.message); continue; }
  if (!data || !data.length) { console.log('  ПУСТО — не применено'); continue; }
  done += 1;
  console.log('  ок:', data[0].start_time);
}
console.log(APPLY ? `записано: ${done}` : `кандидатов: ${TABLE.length}`);
