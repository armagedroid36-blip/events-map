// Ремонт класса «живая карточка ведёт на СНЯТУЮ страницу источника» (запуск 164).
// Проверено 11.10.2026 через прокси 10809 (python urllib, browser headers):
//   - https://nikitari.org/newsite/  -> 404 (корень nikitari.org -> 200)
//   - https://oceanmanswim.com/ayianapa-cyprus -> 404 (корень -> 200)
// Замена найдена на сайте того же владельца:
//   - wnn.cy/elia-giorti-nikitari-festival-afieromeno-topiki-paradosi/ -> 200, 273 КБ,
//     статья о фестивале в Никитари («Η ελιά αποκτά τη δική της γιορτή στο Νικητάρι»)
//   - oceanmanswim.com/races/ayia-napa-cyprus -> 200 (страница гонки в разделе /races,
//     взята из sitemap.xml самого сайта)
// Страховки: карточка живая, её website равен ровно мёртвому URL, живой URL не занят
// другой живой карточкой, событие не в прошлом. DRY по умолчанию, APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('нет ключей в .env'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const FIXES = [
  {
    id: '22f4448c-fdd8-4ce6-bf2e-d5b60dcbf709',
    title: '2nd Olive & Traditional Products Festival',
    dead: 'https://nikitari.org/newsite/',
    live: 'https://wnn.cy/elia-giorti-nikitari-festival-afieromeno-topiki-paradosi/',
  },
  {
    id: 'ef7adfcd-09fa-4389-b9bd-0f3898ad0380',
    title: 'OCEANMAN Cyprus – Ayia Napa',
    dead: 'https://oceanmanswim.com/ayianapa-cyprus',
    live: 'https://oceanmanswim.com/races/ayia-napa-cyprus',
  },
  // Запуск 258 (16.10.2026): cyprus.bz снял страницу фестиваля (410 Gone, страницы нет
  // ни в одном sitemap bz — events-1 / events-el-1 / events-ru-1, снапшота в Wayback нет).
  // Арбитр — независимая афиша cypruspassion.com: «2026-11-05T10:00+02:00», «Erimi Village
  // Square», «Erimi, Limassol District», описание «two-day introduction to mushroom culture»
  // → дата 05.11 и 10:00 карточки подтверждены (той же карточкой в 258 закрыт и вопрос
  // «21.11 у Кипра другая дата»: запись ленты CN `mushroom-festival-2026-11-21` — про село
  // Spilia, это ДРУГОЙ фестиваль, а не арбитр). Официальный сайт mushroomfestival.cy жив,
  // но держит прошлогоднюю редакцию (01–02.11.2025, Erimi Village).
  {
    id: '4f1c6fef-5f6b-423b-b9d8-259a533fb437',
    title: 'Mushroom Festival',
    dead: 'https://cyprus.bz/event/32ed/mushroom-festival-2026',
    live: 'https://cypruspassion.com/events-in-cyprus/mushroom-festival-erimi-2026/',
  },
];

const APPLY = process.env.APPLY === '1';
let done = 0, skipped = 0;

for (const f of FIXES) {
  const { data: rows, error } = await db.from('events')
    .select('id,status,title,website,start_date,city').eq('id', f.id);
  if (error) { console.log('ОШИБКА чтения', f.id, error.message); skipped++; continue; }
  const c = rows?.[0];
  if (!c) { console.log('ОТКЛОНЕНО: карточки нет', f.id); skipped++; continue; }
  if (!['active', 'moderation'].includes(c.status)) { console.log('ОТКЛОНЕНО: статус', c.status, f.id); skipped++; continue; }
  if ((c.website || '') !== f.dead) { console.log('ОТКЛОНЕНО: website не мёртвый', c.website, f.id); skipped++; continue; }
  if (c.start_date && c.start_date < new Date().toISOString().slice(0, 10)) { console.log('ОТКЛОНЕНО: событие в прошлом', c.start_date, f.id); skipped++; continue; }
  const { data: busy } = await db.from('events').select('id')
    .in('status', ['active', 'moderation']).eq('website', f.live).limit(2);
  if (busy?.length) { console.log('ОТКЛОНЕНО: живой URL занят', busy[0].id, f.id); skipped++; continue; }
  console.log((APPLY ? 'ЗАПИСЬ ' : 'DRY ') + f.id + ' | ' + c.title.slice(0, 45) + ' | ' + f.dead + ' -> ' + f.live);
  if (!APPLY) continue;
  const { data: upd, error: e2 } = await db.from('events').update({ website: f.live }).eq('id', f.id).select('id,website');
  if (e2 || !upd?.length) { console.log('ОШИБКА записи', e2?.message); skipped++; continue; }
  done++;
}
console.log(`Готово: применено ${done}, пропущено ${skipped}${APPLY ? '' : ' (DRY)'}`);
