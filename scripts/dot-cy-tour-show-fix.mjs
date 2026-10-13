// Точечный ремонт карточек cyprus.bz, которые страницы гастрольных туров «сворачивают» в одну
// дату тура: JSON-LD отдаёт startDate ПЕРВОЙ даты тура и endDate ПОСЛЕДНЕЙ, а площадку — городскую
// (у каждого города тура своя страница). Карточка печаталась «событие на несколько дней» не в том
// городе/дне. Здесь дата ставится на ПОКАЗ того города, который называет сама карточка (город и
// площадка не трогаются — они уже верны), плюс время с страницы промоутера.
// Арбитр: промоутер ATRIA MUSIC (страница тура: даты/города/зал/время).
// Запуск: DRY по умолчанию, APPLY=1 — запись. Страховки: карточка живая, title/адрес/дата-время совпадают
// с ожидаемыми, после записи — контроль перечитыванием.
import { createClient } from '@supabase/supabase-js';

const APPLY = process.env.APPLY === '1';

const FIXES = [
  {
    // bz: «Lords of The Sound. Music by Hans Zimmer» — страница /event/35b7 (теперь редиректит на 2c01),
    // карточка собрана с площадкой Monte Caputo, Лимасол.
    website: 'https://cyprus.bz/event/35b7/lords-of-the-sound-music-by-hans-zimmer-2027',
    expectTitle: 'Lords of',
    expectAddress: 'Monte Caputo',
    expectCity: 'Лимасол',
    from: { start_date: '2027-01-19', start_time: '19:30:00' },
    to: { start_date: '2027-01-21', end_date: '2027-01-21', start_time: '19:30:00' },
    // Промоутер atriamusic.com/hans-zimmer-2027: «21 Thursday January — Limassol, Monte Caputo, 19:30»
    // (19.01 Пафос Markideio 19:00, 23.01 Никосия Municipal 19:30). Площадка карточки = Лимасол.
    why: 'промоутер Atria: тур Hans Zimmer 21.01 — Лимасол, Monte Caputo, 19:30',
  },
  {
    // bz: «Lords of The Sound - The Music of HANS ZIMMER», страница /event/2c01, venue Nicosia Municipal Theatre
    website: 'https://cyprus.bz/event/2c01/lords-of-the-sound-the-music-of-hans-zimmer-2027',
    expectTitle: 'Lords of',
    expectAddress: 'Nicosia Municipal',
    expectCity: 'Никосия',
    from: { start_date: '2027-01-19', start_time: '19:00:00' },
    to: { start_date: '2027-01-23', end_date: '2027-01-23', start_time: '19:30:00' },
    // Промоутер Atria: «23 Saturday January — Nicosia, Municipal Theatre, 19:30»; bz ставил 19.01 19:00
    // (время пафосского показа) — tour-start вместо своего дня.
    why: 'промоутер Atria: тур Hans Zimmer 23.01 — Никосия, Municipal Theatre, 19:30',
  },
  {
    // bz: «Alice In Wonderland - On Ice», страница /event/2ff0, venue Nicosia Municipal Theatre
    website: 'https://cyprus.bz/event/2ff0/alice-in-wonderland-on-ice-2026',
    expectTitle: 'Alice In Wonderland',
    expectAddress: 'Nicosia Municipal',
    expectCity: 'Никосия',
    from: { start_date: '2026-12-04', start_time: '18:30:00' },
    to: { start_date: '2026-12-05', end_date: '2026-12-05', start_time: '15:30:00' },
    // Промоутер Atria (atriamusic.com/alice-ice-show): «05 Saturday December — Nicosia, Municipal Theater, 15:30»
    // (04.12 Ларнака Municipal 18:30, 06.12 Лимасол Pattihio 15:00, 07.12 Пафос Markideio 18:30).
    why: 'промоутер Atria: Alice on Ice 05.12 — Никосия, Municipal Theatre, 15:30',
  },
  {
    // run 212: карточка-зеркало Cyprus Now у фестиваля Limassol Fashion Week 2026.
    // Лента CN держит ТРИ записи одного фестиваля (11.11, 12.11, 15.11) с разными series_id,
    // у записи 12.11 интервал-мусор (start_at 12.11 21:00Z → end_at 13.11 20:59Z) — отсюда
    // карточка печатала «12.11 23:00 → 13.11 22:59». Официальный сайт промоутера даёт рамку
    // фестиваля 11–15.11 у площадки The Warehouse (Лимасол), а запись 11.11 — точный слот открытия.
    website: 'https://cyprusnow.app/event/limassol-fashion-week-2026-2026-11-14',
    expectTitle: 'Limassol Fashion Week',
    expectAddress: 'Лимасол',
    expectCity: 'Лимасол',
    from: { start_date: '2026-11-12', start_time: '23:00:00' },
    to: { start_date: '2026-11-11', end_date: '2026-11-11', start_time: '18:00:00', end_time: '22:00:00' },
    // limassolfashionweek.com: «THE WAREHOUSE / 11-15 NOVEMBER 2026», страница /venue/ — «Located in the
    // heart of Limassol, The Warehouse»; запись ленты CN «limassol-fashion-week-2026-runway-shows-fashion-
    // events-2026-11-11»: start_at 11.11T16:00Z → end_at 11.11T20:00Z (= 18:00–22:00 местного),
    // venue «The Warehouse by IT», Limassol 34.6628593,33.0261341, ticket_url = limassolfashionweek.com.
    why: 'промоутер limassolfashionweek.com: LIMFW 11–15.11 у The Warehouse (Лимасол), слот открытия 11.11 18:00–22:00',
  },
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const FIELDS = 'id,status,title,start_date,end_date,start_time,end_time,city,address,lat,lng,website';
let planned = 0, applied = 0, skipped = 0;

for (const f of FIXES) {
  const { data, error } = await db.from('events').select(FIELDS).eq('website', f.website).maybeSingle();
  if (error || !data) { console.log('ОТКЛОНЕНО', f.website, 'нет карточки:', error?.message || ''); skipped++; continue; }
  const problems = [];
  if (data.status !== 'active') problems.push('status=' + data.status);
  if (!String(data.title || '').includes(f.expectTitle)) problems.push('title=' + data.title);
  if (!String(data.address || '').includes(f.expectAddress)) problems.push('address=' + data.address);
  if (f.expectCity && !String(data.city || '').startsWith(f.expectCity)) problems.push('city=' + data.city);
  if (String(data.start_date) !== f.from.start_date) problems.push('start_date=' + data.start_date);
  if (f.from.start_time && String(data.start_time) !== f.from.start_time) problems.push('start_time=' + data.start_time);
  if (problems.length) { console.log('ОТКЛОНЕНО', data.id.slice(0, 8), problems.join('; ')); skipped++; continue; }

  planned++;
  console.log('ПЛАН', data.id.slice(0, 8), data.city, '|', data.start_date, data.start_time, '->', data.to || '',
    '=>', f.to.start_date, f.to.start_time, f.to.end_date, '|', f.why);
  if (!APPLY) continue;

  const { error: upErr } = await db.from('events').update({
    start_date: f.to.start_date,
    end_date: f.to.end_date,
    start_time: f.to.start_time,
    ...(f.to.end_time ? { end_time: f.to.end_time } : {}),
  }).eq('id', data.id);
  if (upErr) { console.log('ОШИБКА записи', data.id.slice(0, 8), upErr.message); skipped++; continue; }

  const { data: back } = await db.from('events').select(FIELDS).eq('id', data.id).single();
  const ok = back && String(back.start_date) === f.to.start_date &&
    String(back.end_date) === f.to.end_date && String(back.start_time) === f.to.start_time &&
    (!f.to.end_time || String(back.end_time) === f.to.end_time) &&
    back.city === data.city && back.address === data.address;
  console.log(ok ? 'ЗАПИСАНО' : 'КОНТРОЛЬ НЕ СОШЁЛСЯ', data.id.slice(0, 8), back?.start_date, back?.start_time,
    back?.end_date, '|', back?.city, '|', back?.address);
  if (ok) applied++;
}

console.log(APPLY ? `Итог: записано ${applied}, пропущено ${skipped}` : `DRY: план ${planned}, пропущено ${skipped}`);
