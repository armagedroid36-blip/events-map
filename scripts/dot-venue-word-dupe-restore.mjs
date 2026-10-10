// Возврат ложно заархивированной карточки клуба (класс «2 общих слова = название площадки»).
// Прогон 381 (расписной 20:15Z, 10.10): dedupe склеил «Lubimaya – ION at Dusty Munky» (moderation)
// с «Jepe at Dusty Munky» (active) — разные артисты, разные страницы Cyprus Now, один клуб и одна ночь.
// Страховки: карточка archived, адрес называет площадку, у живой карточки ДРУГОЙ заголовок,
// нет живой карточки с тем же title|start_date.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const TARGET = { id: '57793cf2', title: 'Lubimaya – ION at Dusty Munky', date: '2026-10-16', venue: 'dusty munky' };

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,status,website,lat,lng');
const row = all.find((r) => String(r.id).toLowerCase().startsWith(TARGET.id));
if (!row) { console.log('карточка не найдена'); process.exit(1); }
const problems = [];
if (row.status !== 'archived') problems.push(`status=${row.status} (ожидался archived)`);
if (row.start_date !== TARGET.date) problems.push(`start_date=${row.start_date}`);
if (!String(row.address || '').toLowerCase().includes(TARGET.venue)) problems.push(`адрес «${row.address}» не называет площадку`);
const twin = all.find((r) => r.id !== row.id && r.start_date === TARGET.date && r.status === 'active'
  && [r.title, r.title_ru, r.title_en].some((t) => t && t.toLowerCase().includes('lubimaya')));
if (twin) problems.push(`есть живой близнец ${String(twin.id).slice(0, 8)} «${twin.title}»`);
console.log(`цель: ${String(row.id).slice(0, 8)} | ${row.status} | ${row.start_date} | ${row.address} | ${row.website}`);
if (problems.length) { console.log('ОТКЛОНЕНО: ' + problems.join('; ')); process.exit(0); }
if (!APPLY) { console.log('DRY: вернул бы archived -> moderation'); process.exit(0); }
const r = await db.from('events').update({ status: 'moderation' }).eq('id', row.id).select('id,status');
if (r.error) { console.log('ОШИБКА: ' + r.error.message); process.exit(1); }
if (!r.data?.length) { console.log('ОШИБКА: 0 строк обновлено (anon/RLS?)'); process.exit(1); }
console.log('ПРИМЕНЕНО: ' + JSON.stringify(r.data));
