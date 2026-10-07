// Точка «События»: ремонт класса «end_date раньше start_date».
// Живая карточка 9d72b5c6 «Будущее, за которое стоит умереть» (Никосия, 22.10 20:30, Art Seen)
// несла end_date 2026-10-21 — на день РАНЬШЕ начала. Страница источника
// https://cyprusnow.app/event/a-future-to-die-for-2026-10-22 (200, 250 КБ) отдаёт
// startDate 2026-10-22T20:30:00+03:00 и endAt: null (в JSON вьюхи "time":{"startAt":"2026-10-22T17:30:00.000Z","endAt":null})
// → у события даты окончания НЕТ, значит end_date = null (честно), а не выдуманная дата.
// Запуск: DRY по умолчанию, APPLY=1 для записи.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const TARGETS = [
  {
    id: '9d72b5c6',
    title: 'Будущее, за которое стоит умереть',
    expectEnd: '2026-10-21',
    expectStart: '2026-10-22',
    newEnd: null,
    source: 'https://cyprusnow.app/event/a-future-to-die-for-2026-10-22 — endAt: null',
  },
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,status,start_date,start_time,end_date,website');
const byPrefix = new Map(rows.map((r) => [String(r.id).slice(0, 8), r]));

let applied = 0, skipped = 0, errors = 0;
for (const t of TARGETS) {
  const r = byPrefix.get(t.id);
  if (!r) { console.log('ПРОПУСК', t.id, '— карточки нет'); skipped++; continue; }
  if (r.status === 'archived') { console.log('ПРОПУСК', t.id, '— archived'); skipped++; continue; }
  if (r.end_date !== t.expectEnd) { console.log('ПРОПУСК', t.id, '— end_date в базе', r.end_date, '≠ ожидаемого', t.expectEnd); skipped++; continue; }
  if (r.start_date !== t.expectStart) { console.log('ПРОПУСК', t.id, '— start_date в базе', r.start_date, '≠ ожидаемого', t.expectStart); skipped++; continue; }
  if (String(r.website || '') !== t.source.split(' ')[0]) { console.log('ПРОПУСК', t.id, '— website', r.website, '≠ источника'); skipped++; continue; }
  console.log((APPLY ? 'ПРИМЕНЯЮ' : 'DRY') + ' ' + t.id, '|', (r.title_ru || r.title).slice(0, 40),
    '| end_date', r.end_date, '->', String(t.newEnd), '|', t.source);
  if (!APPLY) { applied++; continue; }
  const { data, error } = await db.from('events').update({ end_date: t.newEnd }).eq('id', r.id).select('id,end_date');
  if (error) { console.error('ОШИБКА', t.id, error.message); errors++; continue; }
  if (!data?.length) { console.error('ОШИБКА', t.id, '— ни одна строка не обновлена'); errors++; continue; }
  console.log('  ок:', data[0].id.slice(0, 8), 'end_date =', String(data[0].end_date));
  applied++;
}
console.log(`Итого: ${APPLY ? 'применено' : 'к применению'} ${applied}, пропущено ${skipped}, ошибок ${errors}`);
