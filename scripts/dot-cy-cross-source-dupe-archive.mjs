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
  if (kill.start_date !== keep.start_date) fail.push(`даты разные (${kill.start_date} / ${keep.start_date})`);
  if ((kill.start_time || '') !== (keep.start_time || '')) fail.push(`время разное (${kill.start_time} / ${keep.start_time})`);
  if (!near(kill.lat, keep.lat, kill.lng, keep.lng)) fail.push(`точки разные (${kill.lat},${kill.lng} / ${keep.lat},${keep.lng})`);
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
