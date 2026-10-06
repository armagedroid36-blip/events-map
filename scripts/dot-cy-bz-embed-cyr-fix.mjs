// Добивка класса «центровые координаты» Кипра: карточки, отклонённые пакетным аудитом
// ТОЛЬКО за то, что адрес карточки записан по-русски, а страница cyprus.bz — латиницей
// (страховка №3 искала русское слово на латинской странице). Каждая карточка проверена
// зондом dot-cy-bz-embed-cyr-probe.mjs: имя площадки на странице ЕСТЬ, другой записью.
// Таблица: id -> проверенная embed-координата страницы + цитата источника.
// Страховки: карточка не archived, стоит РОВНО на центровой точке (иначе не трогаем),
// точность 5+ знаков, округ координаты = округ метки city, сдвиг > 50 м.
// Запуск: node --env-file=.env scripts/dot-cy-bz-embed-cyr-fix.mjs         (DRY)
//         APPLY=1 node --env-file=.env scripts/dot-cy-bz-embed-cyr-fix.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtNear, districtOfCity, km } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const CENTERS = new Set(['34.7071,33.0226', '34.9182,33.6194', '35.1856,33.3823', '34.7754,32.4245', '35.0375,34.0041', '35.1167,33.9432']);
const isCenter = (lat, lng) => CENTERS.has(String(Number(lat)) + ',' + String(Number(lng)));

const FIXES = [
  { id: '9010635a', venue: 'Music Hall, Лимасол', lat: 34.6971053, lng: 33.0917877, src: 'cyprus.bz/event/35b1 — meta «Thu, Nov 12 · Music Hall, Limassol», JSON-LD location.name «Music Hall»' },
  { id: 'b5e59d3f', venue: 'Ivis Maliotou Park, Пафос', lat: 34.7741371, lng: 32.4200036, src: 'cyprus.bz/event/3671 — meta «Fri, Oct 9 · Ivis Maliotou Park, Paphos»' },
  { id: 'bbac87f6', venue: "Sarah's Jazz & Blues Club, Никосия", lat: 35.1731478, lng: 33.3624634, src: 'cyprus.bz/event/3603 — meta «Fri, Oct 9 · Sarah’s Jazz & Blues Club, Nicosia»' },
  { id: 'd41899dd', venue: 'ETKO Hangar (Цифликудиа), Лимасол', lat: 34.66221, lng: 33.019275, src: 'cyprus.bz/event/2cd3 — meta «Sat, Oct 24 · ETKO Hangar, Limassol»; адрес карточки «Тсифликудион» = район ETKO, координата совпала с проверенной ETKO Hangar' },
  { id: 'dd1d7523', venue: 'Troodos Observatory', lat: 34.926254, lng: 32.9991988, src: 'cyprus.bz/event/3679 — title «Troodos Observatory Hike, Troodos»' },
  { id: '9246b252', venue: 'St Raphael Resort & Marina', lat: 34.7131365, lng: 33.1674229, src: 'embed страницы этой карточки дал городской фолбэк (34.675,33.042); точка площадки проверена на карточке 1279fbd6 того же отеля (запуск 56)' },
];

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date');
let applied = 0, rejected = 0;
for (const f of FIXES) {
  const r = rows.find((x) => x.id.startsWith(f.id));
  if (!r) { console.log(`${f.id}: карточка не найдена`); rejected++; continue; }
  const label = `${f.id} «${(r.title_ru || r.title || '').slice(0, 40)}» | ${f.venue} | ${r.city} | ${r.lat},${r.lng} -> ${f.lat},${f.lng}`;
  const why = [];
  if (r.status === 'archived') why.push('карточка archived');
  if (!isCenter(r.lat, r.lng)) why.push('НЕ на центровой точке (координаты менялись)');
  const dCity = districtOfCity(r.city);
  const dPoint = districtOf(f.lat, f.lng) || districtNear(f.lat, f.lng);
  if (dCity && dCity !== dPoint) why.push(`чужой округ (${dPoint} vs ${dCity})`);
  const shift = km(r.lat, r.lng, f.lat, f.lng);
  if (shift < 0.05) why.push('уже на месте');
  if (why.length) { console.log(`${label} ОТКЛОНЕНО: ${why.join(', ')}`); rejected++; continue; }
  if (!APPLY) { console.log(`${label} (${(shift * 1000).toFixed(0)} м) [DRY] источник: ${f.src}`); continue; }
  const { data, error } = await db.from('events').update({ lat: f.lat, lng: f.lng }).eq('id', r.id).select('id');
  if (error || !data?.length) { console.log(`${label} ОШИБКА: ${error?.message || 'обновлено 0 строк'}`); rejected++; continue; }
  console.log(`${label} (${(shift * 1000).toFixed(0)} м) записано | ${f.src}`);
  applied++;
}
console.log(`\nГотово: применено ${applied}, отклонено ${rejected}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
