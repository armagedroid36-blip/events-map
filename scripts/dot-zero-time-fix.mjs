// Точка «События»: ремонт класса «время-заглушка 00:00 при реальном времени источника».
// Разбор запуска 166: из 21 живой карточки с 00:00 у 20 время так и отдаёт источник
// (Cyprus Now JSON-LD 00:00:00, cyprus.bz 22:00Z = 00:00 местного), и только у одной
// время в источнике есть, а в карточке потеряно.
//
// Использование: node --env-file=.env scripts/dot-zero-time-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// Карточка → проверенное время + ЦИТАТА со страницы источника.
const TARGETS = [
  {
    id: '99598ed0', // OlympusMan Triathlon 2026, Лимасол, 07.11.2026
    start_date: '2026-11-07',
    start_time: '14:00:00',
    website: 'cyprus.bz/event/262e',
    cite: 'cyprus.bz/event/262e: JSON-LD startDate 2026-11-07T12:00:00+00:00 (= 14:00 местного, UTC+2); текст страницы «Date & Time NOV 07 SAT Starts 14:00 Troodos Mountains»',
  },
];

const rows = await selectAll(db, 'events', 'id,status,title,start_date,start_time,end_date,website');
let applied = 0, skipped = 0;
for (const t of TARGETS) {
  const card = rows.find((r) => String(r.id).toLowerCase().startsWith(t.id));
  if (!card) { console.log(`ОТКЛОНЕНО ${t.id}: карточка не найдена`); skipped++; continue; }
  const problems = [];
  if (!['active', 'moderation'].includes(card.status)) problems.push(`status=${card.status}`);
  if (!/^00:00(:00)?$/.test(String(card.start_time || ''))) problems.push(`start_time=${card.start_time} (не заглушка)`);
  if (card.start_date !== t.start_date) problems.push(`start_date=${card.start_date} != ${t.start_date}`);
  if (t.website && !String(card.website || '').includes(t.website)) problems.push(`website не тот: ${card.website}`);
  if (problems.length) { console.log(`ОТКЛОНЕНО ${t.id}: ${problems.join(', ')}`); skipped++; continue; }
  console.log(`${APPLY ? 'ПРАВКА' : 'DRY'} ${t.id} «${card.title}» ${card.start_date} 00:00 -> ${t.start_time}`);
  console.log(`   цитата: ${t.cite}`);
  if (APPLY) {
    const { data, error } = await db.from('events').update({ start_time: t.start_time }).eq('id', card.id).select('id,start_time');
    if (error) { console.log('   ОШИБКА', error.message); skipped++; continue; }
    if (!data || !data.length) { console.log('   ОШИБКА: 0 строк обновлено'); skipped++; continue; }
    console.log(`   записано: start_time=${data[0].start_time}`);
  }
  applied++;
}
console.log(`Итого: применено ${applied}, пропущено ${skipped}${APPLY ? '' : ' (DRY, база не менялась)'}`);
