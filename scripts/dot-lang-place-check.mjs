// Проверка нового правила «одно место в двух языках» (liveLangPlaceMatch):
// 1) ВОСПРОИЗВОДИМОСТЬ (recall) — правило обязано видеть 4 сведённые пары запуска 47
//    (сейчас их близнецы в archived, поэтому берём строки без фильтра по статусу);
// 2) ТОЧНОСТЬ (precision) — по живым карточкам (active/moderation/needs_changes)
//    правило не должно находить ни одной НОВОЙ пары, кроме уже ловимых
//    строгим/аббревиатурным ключом.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import * as L from './live-dupe-key.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events',
  'id,status,title,title_ru,title_en,start_date,start_time,city,address,lat,lng,website');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));

const PAIRS = [
  ['287f1564', 'd6d536c7'], // Rantevou 17.10 20:30 Никосия — Skali ↔ Скали Агланцияс
  ['c918d845', 'be61af07'], // Roxette 17.10 20:00 Лимасол — Marios Tokas RU ↔ EN
  ['633a31c7', 'd70a20df'], // Murder on the Orient Express 03.10 20:00 Никосия
  ['cd50ee20', '04f731ea'], // Race for the Cure 01.11 Никосия
  ['cd50ee20', 'c8db8664'],
];

console.log('=== RECALL: сведённые пары запуска 47 ===');
let hit = 0;
for (const [a, b] of PAIRS) {
  const ra = byId.get(a), rb = byId.get(b);
  if (!ra || !rb) { console.log(`${a} / ${b}: СТРОКИ НЕТ (${!!ra}${!!rb})`); continue; }
  const strict = L.liveDupeMatch(ra, rb), ab = L.liveAbbrevMatch(ra, rb), lang = L.liveLangPlaceMatch(ra, rb);
  if (lang) hit++;
  console.log(`${a}[${ra.status}] <-> ${b}[${rb.status}] strict=${strict ? 'да' : '-'} abbrev=${ab ? 'да' : '-'} LANG=${lang || 'НЕТ'}`);
}
console.log(`recall: ${hit}/${PAIRS.length}`);

console.log('\n=== PRECISION: живой контур (active/moderation/needs_changes) ===');
const live = rows.filter((r) => ['active', 'moderation', 'needs_changes'].includes(r.status));
console.log(`живых строк: ${live.length}`);
const byDay = new Map();
for (const r of live) { const k = L.dayKey(r); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); }
let strictN = 0, langN = 0, newN = 0;
const news = [];
for (const list of byDay.values()) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const strict = L.liveDupeMatch(list[i], list[j]) || L.liveAbbrevMatch(list[i], list[j]);
    const lang = L.liveLangPlaceMatch(list[i], list[j]);
    if (strict) strictN++;
    if (lang) langN++;
    if (lang && !strict) {
      newN++;
      news.push(`${list[i].id.slice(0, 8)}[${list[i].status}] <-> ${list[j].id.slice(0, 8)}[${list[j].status}] ${lang}
    A: ${list[i].start_date} ${list[i].start_time} ${list[i].city} | ${(list[i].title_ru || list[i].title).slice(0, 50)} | ${list[i].address}
    B: ${list[j].start_date} ${list[j].start_time} ${list[j].city} | ${(list[j].title_ru || list[j].title).slice(0, 50)} | ${list[j].address}`);
    }
  }
}
console.log(`пар строгим/аббрев-ключом: ${strictN}; правилом «двух языков»: ${langN}; НОВЫХ (только языковое): ${newN}`);
for (const s of news) console.log('  ' + s);

console.log('\n=== SYNTHETIC ===');
const mk = (o) => ({ title: '', title_ru: null, title_en: null, start_date: '2026-11-20', start_time: '20:00', city: 'Лимасол, Кипр', address: '', ...o });
const cases = [
  ['RU↔EN одна площадка (ожидаем да)', true, mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Муниципальный садовый театр Мариос Токас' }),
    mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Marios Tokas Municipal Garden Theatre' })],
  ['то же, но разное время (ожидаем нет)', false, mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Муниципальный садовый театр Мариос Токас' }),
    mk({ title: 'Roxette Tribute Show Night Limassol', start_time: '18:00', address: 'Marios Tokas Municipal Garden Theatre' })],
  ['разные площадки, то же название/время (ожидаем нет)', false, mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Муниципальный садовый театр Мариос Токас' }),
    mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Pattichio Municipal Theatre' })],
  ['адрес-заглушка у одной (ожидаем нет)', false, mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Лимасол, Кипр' }),
    mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Marios Tokas Municipal Garden Theatre' })],
  ['то же место, разные события (ожидаем нет: имена не пересекаются)', false, mk({ title: 'Roxette Tribute Show Night Limassol', address: 'Marios Tokas Municipal Garden Theatre' }),
    mk({ title: 'Кабаре Афина: вечер греческой музыки', address: 'Муниципальный садовый театр Мариос Токас' })],
];
let okSyn = 0;
for (const [name, expect, a, b] of cases) {
  const got = !!L.liveLangPlaceMatch(a, b);
  const pass = got === expect;
  if (pass) okSyn++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: ${got}`);
}
console.log(`синтетика: ${okSyn}/${cases.length}`);
