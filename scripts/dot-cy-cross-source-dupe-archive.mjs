// dot-cy-cross-source-dupe-archive.mjs — ремонт класса «одно событие собрано разными источниками →
// несколько меток на одной точке» (кипрские пары, подтверждённые данными запуска 112).
// Ключ дедупа `title|start_date` их не склеивает: названия у источников разные.
// Оставляем карточку с более полными данными (адрес площадки, описание в двух языках, фото),
// слабейшую — в архив. Архив — не удаление (штатный dedupe-events.mjs делает то же).
// Страховки: обе карточки active, одна дата, одно время, точки в пределах 0.0015°, у обеих
// заголовок содержит общий смысловой токен, разные website. DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const PAIRS = [
  {
    keep: 'b80afec6', archive: 'c4a495ba', token: /viennese\s*waltz/i,
    note: 'Viennese Waltzes 21.11 Пафос 20:30, Markideio Theatre: cyprus.bz (3 фото, 295 знаков описания, end_date) vs cyprusnow (1 фото, 125 знаков)',
  },
  {
    keep: 'd41899dd', archive: 'b8274fc9', token: /bi-?2/i,
    note: 'BI-2 24.10 Лимасол 20:00, 34.66221,33.019275 (Тсифликудион/ETKO): cyprus.bz (описание ru+en, 3 фото, end_date) vs cyprusnow (заголовок с мусорным хвостом «Check out all the events…»)',
  },
  {
    keep: 'e6352769', archive: 'e01fbad6', token: /(lone|one)\s*shoe|παπο[yú]/i,
    note: 'The Lone/One Shoe 08.11 Никосия 10:30, 35.1680107,33.3146209 (Amphitheatre of the Cyprus Institute of Neurology and Genetics): cyprusnow (583 знака, перевод ru+en, точное имя площадки) vs cyprus.bz (296 знаков, описание дублирует заголовок)',
  },
  {
    keep: 'b10ba6d1', archive: 'a593accd', token: /spartacus|спартак/i,
    note: 'Spartacus Ballet 27.11 Никосия 19:30, 35.1726381,33.3550588 (Nicosia Municipal Theatre): cyprus.bz (адрес площадки «Nicosia Municipal Theatre, Nicosia», полное описание 600+ знаков, 3 фото) vs cyprusnow (адрес уровня тура «Nicosia Municipal Theatre/ Pattihio Theatre Limassol», описание со служебным хвостом «Scroll down for English version», 1 фото)',
  },
  {
    keep: 'ed200c34', archive: '09a142aa', token: /(jack|beanstalk|τζακ|φασολ|fasolia)/i,
    note: 'Jack and the Beanstalk 14.11 Никосия 11:00, Latsia Theatre (35.1063639,33.3782668): cyprus.bz (slug /event/3578/jack-and-the-beanstalk-2026 — греч. название «O Tzak Kai I Fasolia», 3 фото) vs cyprusnow (1 фото) — одна постановка, разные языковые названия источника',
  },
  {
    keep: '5f0a1b94', archive: '0ac76029', token: /scalifornia/i,
    note: 'Scalifornia 10.10 Ларнака 11:00, Salina Municipal Park (34.916,33.625): cyprus.bz (slug /event/3233/scalifornia-a-food-festival-2026, 3 фото) vs cyprusnow (1 фото)',
  },
  {
    keep: '4de25efe', archive: '268e5e70', token: /2sides/i,
    note: '2Sides 09.10 Лимасол 20:00, Dusty Munky (34.680,33.046): cyprusnow «2Sides at Dusty Munky» vs cyprusnow «2SIDES LIMASSOL» — два слага одной страницы источника, названия разошлись',
  },
  {
    keep: 'a3d16f5f', archive: '1685ff91', token: /samael/i,
    note: 'Samael 13.11 Никосия 20:00, DownTown Live (35.165,33.350): cyprusnow (адрес площадки «DownTown Live») vs cyprus.bz (адрес «DownTown Live, Limassol» — ложный город источника внутри никосийской карточки)',
  },
  {
    // подкласс «два слага ОДНОЙ страницы источника»: website совпадает, поэтому штатная страховка
    // «разные website» заменяется явным ожиданием этой страницы у обеих карточек.
    keep: '1c5a27ba', archive: 'bc52f4e4', token: /halloween/i, sameSite: true,
    website: 'https://cyprusnow.app/event/halloween-extravaganza-drag-show-dj-night-in-limassol-2026-10-30',
    note: 'Halloween Extravaganza 30.10 Лимасол 21:00, Rooftop Bar at Limassol Agora (34.6761,33.0434): оставляю cyprusnow-слаг с адресом площадки и переводом ru+en (1 фото), архив — карточка того же события с адресом «Limassol Agora» и описанием без перевода (1 фото)',
  },
  {
    // подкласс «одна страница источника, ДВЕ карточки с разными временем»: страница обновилась,
    // одна карточка осталась со старыми данными. Арбитр — JSON-LD страницы (`source`): оставляем
    // ту карточку, что совпадает с источником, устаревшую — в архив.
    keep: '9c9a2952', archive: '3da16852', token: /kazanias/i, sameSite: true,
    website: 'https://cyprusnow.app/event/grape-harvest-festival-2026-08-16',
    source: { start_date: '2026-10-25', start_time: '18:00:00' },
    note: 'Festival "Kazaniasmata" 25.10 Arsos Village Square (34.8409,32.7691): страница даёт 18:00-21:00; оставляю карточку с адресом «Arsos Village Square» (18:00), архив — «Kazaniasmata Festival 2026 @ Arsos» с устаревшим временем 17:00 и адресом уровня города «Лимасол, Кипр»',
  },
  {
    keep: '9a506e8a', archive: 'b3ca7316', token: /lotus\s*parable/i, sameSite: true,
    website: 'https://cyprusnow.app/event/lotus-parable-2026-10-17',
    source: { start_date: '2026-10-17', start_time: '20:30:00' },
    note: 'Lotus Parable 17.10 Лимасол: страница даёт 20:30-11:00 без площадки; оставляю «Lotus Parable – Label Night» (20:30, title источника), архив — «Lotus Parable» с временем 22:00 и площадкой «Sacred Garden», которой на странице источника НЕТ (не подтверждается)',
  },
  {
    keep: '36a87826', archive: '7db533dc', token: /cultural\s*fe?s?tival/i, sameSite: true,
    website: 'https://cyprusnow.app/event/cultural-festival-2026-10-09',
    source: { start_date: '2026-10-10', start_time: '15:30:00' },
    note: 'Cultural Festival 10.10 Klirou Village Square (35.0213564,33.1777225): страница даёт 10.10 15:30; оставляю карточку с этой датой, архив — карточка с устаревшей датой 09.10 18:00 (та же точка и адрес)',
  },
  {
    keep: '007d21be', archive: '3312ee32', token: /comic\s*con/i,
    note: 'Comic Con / Halloween 31.10 Никосия 12:00-21:00, Mall of Engomi: cyprus.bz (страница /event/35b5, 3 фото, название «Halloween in the World of Comics. Comic Con 2026», JSON-LD 10:00-19:00Z = 12:00-21:00 EET) vs cyprusnow (1 фото, «NecroComicCon 2026: Halloween at Mall of Engomi», JSON-LD 12:00-21:00+02:00) — та же площадка, та же дата и часы; страница cyprus.bz сама упоминает NecroComicCon',
  },
  {
    keep: '2627b94c', archive: '7abd838b', token: /aglanjazz/i,
    note: 'AglanJazz Festival 2026 10.10 Никосия 19:00, Skali Amphitheatre (Aglantzia): две записи одного фестиваля в ленте cyprusnow (разные слаги, JSON-LD обеих 2026-10-10T19:00+03:00); оставляю карточку с адресом «Skali Amphitheatre, Aglantzia», архив — «AglanJazz Festival 2026: Live Jazz Night in Nicosia» с адресом «Skali Aglantzas»',
  },
  {
    keep: '4cf5d3f2', archive: '2a81f375', token: /christmas\s*village/i,
    note: 'Рождественская деревня Калопанайотиса 21.11.2026-06.01.2027, 34.993,32.830: cyprus.bz (3 фото, адрес «Fairytale Christmas Village Kalopanayiotis», JSON-LD 21.11 11:00 местного) vs cyprusnow (1 фото, «Kalopanagiotis Christmas Village 2026: Programme & Dates», JSON-LD 21.11 11:00+02:00) — одна сезонная площадка, два источника',
  },
];

const rows = await selectAll(db, 'events', 'id,title,title_ru,start_date,start_time,city,address,lat,lng,website,status,photos,description,description_en');
const live = rows.filter((r) => r.status === 'active');
const byId = new Map(live.map((r) => [r.id.slice(0, 8), r]));
const near = (a, b, c, d) => Math.abs(Number(a) - b) < 0.0015 && Math.abs(Number(c) - d) < 0.0015;

let applied = 0, skipped = 0;
for (const p of PAIRS) {
  const keep = byId.get(p.keep), kill = byId.get(p.archive);
  if (!keep) { console.log(`ПРОПУСК ${p.keep}: оставляемая карточка не active/нет в базе`); skipped++; continue; }
  if (!kill) { console.log(`ПРОПУСК ${p.archive}: карточка не active/нет в базе`); skipped++; continue; }
  const fail = [];
  if (p.source) {
    // арбитр — страница источника: обе карточки с одного website, а верные дата/время берём из JSON-LD
    if (keep.start_date !== p.source.start_date || (keep.start_time || '') !== p.source.start_time)
      fail.push(`оставляемая не совпадает с источником (${keep.start_date} ${keep.start_time} vs ${p.source.start_date} ${p.source.start_time})`);
    if (kill.start_date === p.source.start_date && (kill.start_time || '') === p.source.start_time)
      fail.push('обе карточки совпадают с источником — разбирать вручную');
  } else {
    if (kill.start_date !== keep.start_date) fail.push(`даты разные (${kill.start_date} / ${keep.start_date})`);
    if ((kill.start_time || '') !== (keep.start_time || '')) fail.push(`время разное (${kill.start_time} / ${keep.start_time})`);
    if (!near(kill.lat, keep.lat, kill.lng, keep.lng)) fail.push(`точки разные (${kill.lat},${kill.lng} / ${keep.lat},${keep.lng})`);
  }
  if (!p.token.test(kill.title) || !p.token.test(keep.title)) fail.push('заголовки не про одно событие');
  if (p.sameSite) {
    if (kill.website !== p.website || keep.website !== p.website) fail.push('website не та страница, что ожидалась');
  } else if (kill.website === keep.website) fail.push('одинаковый website');
  // третьи копии на той же точке/дате
  const same = live.filter((r) => r.id.slice(0, 8) !== p.keep && r.id.slice(0, 8) !== p.archive
    && r.start_date === keep.start_date && near(r.lat, keep.lat, r.lng, keep.lng));
  console.log(`--- ${p.keep} ← оставляю | ${p.archive} ← в архив`);
  console.log(`   ${keep.title} | ${keep.start_date} ${keep.start_time} | ${keep.lat},${keep.lng} | ${keep.address} | фото ${(keep.photos || []).length} | ${keep.website}`);
  console.log(`   ${kill.title} | ${kill.start_date} ${kill.start_time} | ${kill.lat},${kill.lng} | ${kill.address} | фото ${(kill.photos || []).length} | ${kill.website}`);
  if (same.length) console.log(`   ВНИМАНИЕ: на той же точке/дате ещё ${same.length} живых: ${same.map((r) => r.id.slice(0, 8) + ' ' + r.title.slice(0, 40)).join('; ')}`);
  if (fail.length) { console.log(`   -> пропуск: ${fail.join('; ')}`); skipped++; continue; }
  if (!APPLY) { console.log('   DRY: запись не делаю'); continue; }
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', kill.id).select('id,status');
  if (error || !data?.length || data[0].status !== 'archived') { console.log(`   ОШИБКА записи: ${error?.message || JSON.stringify(data)}`); skipped++; continue; }
  applied++;
  console.log('   записано: archived');
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
