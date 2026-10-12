// Точечный ремонт карточек cyprus.bz, которые СВОРАЧИВАЮТ гастрольный тур в один город Пафос.
// Кейс: страница источника отдаёт интервал всего тура (startDate первой даты, endDate последней),
// место ставит Markideio Theatre / Paphos, тогда как промоутер (ATRIA MUSIC) и лента Cyprus Now
// называют на эту дату другой город. Запуск: DRY по умолчанию, APPLY=1 — запись.
// Страховки: карточка живая, city начинается с «Пафос», адрес называет Markideio, ссылка — cyprus.bz.
import { createClient } from '@supabase/supabase-js';

const APPLY = process.env.APPLY === '1';

const FIXES = [
  {
    id: '41e94250-fd39-4bfd-948d-406ff315ce0f',
    expectTitle: 'The Nutcracker Ballet',
    from: { city: 'Пафос, Кипр', address: 'Markideio Theatre, Paphos' },
    to: {
      start_time: '15:30:00',
      city: 'Лимасол, Кипр',
      address: 'Pattihio Theatre, Limassol',
      lat: 34.6813906,
      lng: 33.0440049,
    },
    // Арбитры: (1) промоутер atriamusic.com/nutcracker-ballet-2026 — «28 Saturday November,
    // Limassol, Pattihio Theatre, 15:30»; (2) лента Cyprus Now, запись тура 40d1f13a
    // start_at 2026-11-28T13:30Z (=15:30 местного), city Limassol.
    why: 'промоутер + лента CN: 28.11 тур играет в Лимасоле, Pattihio, 15:30',
  },
  {
    id: '41f6f989-28b5-4109-9710-51fa83b19993',
    expectTitle: 'Wiener Mozart',
    from: { city: 'Пафос, Кипр', address: 'Markideio Theatre, Paphos' },
    to: {
      start_time: '19:30:00',
      city: 'Лимасол, Кипр',
      address: 'Pattihio Theatre, Limassol',
      lat: 34.6813906,
      lng: 33.0440049,
    },
    // Арбитры: (1) промоутер atriamusic.com/mozart — «December 11, Friday, 7:30 PM, Limassol,
    // Pattihio Theatre» (12.12 Пафос 20:00, 13.12 Никосия 20:30 — так и стоят); (2) лента Cyprus Now,
    // запись a86f4fa2 (slug …в-лимасоле…-2026-12-11) start_at 2026-12-11T17:30Z = 19:30 местного, city Limassol.
    why: 'промоутер (Atria, тур Mozart) + лента CN: 11.12 концерт в Лимасоле, Pattihio, 19:30',
  },
];

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

let planned = 0, applied = 0, skipped = 0;

for (const f of FIXES) {
  const { data, error } = await db.from('events')
    .select('id,status,title,title_ru,start_date,start_time,city,address,lat,lng,website')
    .eq('id', f.id).single();
  if (error || !data) { console.log('ОТКЛОНЕНО', f.id, 'нет карточки', error?.message || ''); skipped++; continue; }
  const problems = [];
  if (data.status !== 'active') problems.push('status=' + data.status);
  if (!String(data.title || '').includes(f.expectTitle)) problems.push('title=' + data.title);
  if (!String(data.city || '').startsWith('Пафос')) problems.push('city=' + data.city);
  if (!String(data.address || '').includes('Markideio')) problems.push('address=' + data.address);
  if (!String(data.website || '').includes('cyprus.bz')) problems.push('website=' + data.website);
  if (problems.length) { console.log('ОТКЛОНЕНО', f.id, problems.join('; ')); skipped++; continue; }

  planned++;
  console.log('ПЛАН', f.id, data.start_date, data.start_time, data.city, '->',
    f.to.start_time, f.to.city, f.to.address, f.to.lat + ',' + f.to.lng, '| ' + f.why);
  if (!APPLY) continue;

  const { data: upd, error: uerr } = await db.from('events').update(f.to).eq('id', f.id).select('id');
  if (uerr || !upd?.length) { console.log('ОШИБКА записи', f.id, uerr?.message || '0 строк'); continue; }
  applied++;
}

if (APPLY && applied) {
  for (const f of FIXES) {
    const { data } = await db.from('events')
      .select('id,status,start_date,start_time,city,address,lat,lng,website').eq('id', f.id).single();
    if (data) console.log('КОНТРОЛЬ', data.id, data.status, data.start_date, data.start_time, data.city,
      data.address, data.lat + ',' + data.lng);
  }
}
console.log(`Итог: план ${planned}, записано ${applied}, пропущено ${skipped}${APPLY ? '' : ' (DRY)'}`);
