// Точка «События»: ремонт класса «живая карточка без времени начала (start_time null),
// хотя источник время даёт». Запуск 177: у 5 живых карточек будущего времени нет —
// 3 TG-афиши Вьетнама (источник-пост времени не несёт), турнир famagustatc (расписание),
// и 22f4448c «2nd Olive & Traditional Products Festival» (11.10), где на странице-источнике
// время есть. Сверка — только по тексту страницы владельца события.
// Использование: node --env-file=.env scripts/dot-missing-time-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const TARGETS = [
  {
    id: '22f4448c', // 2nd Olive & Traditional Products Festival, Никитари (метка Никосия), 11.10.2026
    start_date: '2026-10-11',
    start_time: '11:00:00',
    website: 'wnn.cy/elia-giorti-nikitari-festival',
    cite: 'wnn.cy (статья 09.10.2026): в афише события «Το 2ο Φεστιβάλ Ελιάς & Παραδοσιακών Προϊόντων στην Κοινότητα Νικηταρίου–Ασίνου 11 October 2026  11:00 - 11:59»',
  },
];

const rows = await selectAll(db, 'events', 'id,status,title,start_date,start_time,end_date,website');
let applied = 0, skipped = 0;
for (const t of TARGETS) {
  const card = rows.find((r) => String(r.id).toLowerCase().startsWith(t.id));
  if (!card) { console.log(`ОТКЛОНЕНО ${t.id}: карточка не найдена`); skipped++; continue; }
  const problems = [];
  if (!['active', 'moderation'].includes(card.status)) problems.push(`status=${card.status}`);
  if (card.start_time) problems.push(`start_time=${card.start_time} (не пусто)`);
  if (card.start_date !== t.start_date) problems.push(`start_date=${card.start_date} != ${t.start_date}`);
  if (t.website && !String(card.website || '').includes(t.website)) problems.push(`website не тот: ${card.website}`);
  if (problems.length) { console.log(`ОТКЛОНЕНО ${t.id}: ${problems.join(', ')}`); skipped++; continue; }
  console.log(`${APPLY ? 'ПРАВКА' : 'DRY'} ${t.id} «${card.title}» ${card.start_date} (пусто) -> ${t.start_time}`);
  console.log(`   цитата: ${t.cite}`);
  if (APPLY) {
    const { data, error } = await db.from('events').update({ start_time: t.start_time }).eq('id', card.id).select('id,start_time,start_date,status');
    if (error) { console.log('   ОШИБКА', error.message); skipped++; continue; }
    if (!data || !data.length) { console.log('   ОШИБКА: 0 строк обновлено'); skipped++; continue; }
    console.log(`   записано: start_time=${data[0].start_time}, start_date=${data[0].start_date}, status=${data[0].status}`);
  }
  applied++;
}
console.log(`Итого: применено ${applied}, пропущено ${skipped}${APPLY ? '' : ' (DRY, база не менялась)'}`);
