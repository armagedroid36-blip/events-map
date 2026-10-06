// dot-cy-venue-pin-fix.mjs — кипрские карточки, стоящие на центровой точке города,
// хотя адрес называет конкретную площадку/улицу → пин по проверенной координате.
// Координаты проверены (источник/OSM), city НЕ меняется (проверено вручную).
// DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// id -> { lat, lng, source, why }
const FIXES = {
  '137c58e9': { lat: 34.6824125, lng: 33.0259269, source: 'cyprusnow.app (geo площадки, run 39)', why: 'ITF MASTERS 400 — Famagusta Tennis Club, 3 Mesaorias Str, Лимасол' },
  '707055aa': { lat: 34.6824125, lng: 33.0259269, source: 'cyprusnow.app (geo площадки, run 39)', why: 'TEU14 — тот же клуб' },
  'e37a0231': { lat: 34.6824125, lng: 33.0259269, source: 'cyprusnow.app (geo площадки, run 39)', why: 'TEU16 — тот же клуб' },
  '38e9fe08': { lat: 34.6914554, lng: 33.0770619, source: 'Nominatim: Promachon Eleftherias, Λεμεσός (34.6914554,33.0770619)', why: 'Regatta of Champions — FAMAGUSTA NAUTICAL CLUB, Promachon Eleftherias 1, Лимасол' },
  'b65ba6ea': { lat: 34.8943595, lng: 33.2958595, source: 'Nominatim/OSM relation 9226119 Lefkara Dam (Pano Lefkara, Ларнака)', why: 'OMNIVA Events: Lefkara Reservoir' },
  'cfd72366': { lat: 34.9978686, lng: 33.4626265, source: 'страница cyprus.bz/ru/event/3647 (площадка «Kinimatotheatro AKROPOL - LYMPIA», метка «Lympia, Никосия», карта-поиск «Lympia, Cyprus») + Nominatim «Λύμπια, Lympia, Δήμος Νότιας Λευκωσίας-Ιδαλίου, Епархия Никосии»', why: 'Скуликула и человеческий голос — точка НАСЕЛЁННОГО ПУНКТА Лимпья (уровень села, как Latsia в run 62)' },
};

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));
const near = (a, b) => a != null && Math.abs(a - b) < 0.002;
const CENTERS = [[34.7071, 33.0226], [34.9182, 33.6194], [35.1856, 33.3823], [34.7754, 32.4245]];

let applied = 0, skipped = 0;
for (const [prefix, fix] of Object.entries(FIXES)) {
  const r = byId.get(prefix);
  if (!r) { console.log(`ПРОПУСК ${prefix}: карточки нет в базе`); skipped++; continue; }
  const onCenter = CENTERS.some(([la, ln]) => near(r.lat, la) && near(r.lng, ln));
  const shiftKm = Math.hypot((fix.lat - (r.lat ?? 0)) * 111, (fix.lng - (r.lng ?? 0)) * 91);
  console.log(`${prefix} | ${r.status} | ${r.city} | ${r.lat},${r.lng} -> ${fix.lat},${fix.lng} | сдвиг ${shiftKm.toFixed(2)} км | на центровой: ${onCenter ? 'да' : 'НЕТ'}`);
  console.log(`   ${String(r.title).slice(0, 60)}`);
  console.log(`   ${fix.why} | источник: ${fix.source}`);
  if (!onCenter) { console.log('   -> пропуск: карточка уже не на центровой точке'); skipped++; continue; }
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update({ lat: fix.lat, lng: fix.lng }).eq('id', r.id).select('id,lat,lng');
  if (error || !data?.length) { console.log(`   ОШИБКА записи: ${error?.message || '0 строк'}`); skipped++; continue; }
  applied++;
  console.log(`   записано: ${data[0].lat},${data[0].lng}`);
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
