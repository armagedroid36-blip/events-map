// Юнит+регресс-проверка фильтра мусорных адресов (dot-events, запуск 73).
// node --env-file=.env scripts/dot-addr-junk2-check.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { isJunkAddress, cleanAddress } from './address-junk.mjs';

// --- юнит на реальных строках базы (обязаны отсекаться) ---
const MUST_JUNK = [
  'Где: локация после регистрации',
  'проведения после регистрации',
  'TBA',
  'TBD',
  'Где: локация при записи',
  'север',
  'Локацию пришлю в личку (малолюдный пляж в районе мраморных гор в Дананге)',
  'Загородный Eco-Resort',
];
// --- обязаны проходить как настоящие адреса ---
const MUST_PASS = [
  'Nhà hát Trưng Vương, 86 Hùng Vương, Đà Nẵng',
  'Ресторан 369',
  'Livadero Park, Palaichori',
  'Famagusta Tennis Club, 3 Mesaorias Str, Limassol',
  'Кинематотеатр Acropol Lympia, Никосия',
  '1A Nguyễn Phúc Chu, Hội An',
  'Загородный клуб «Тихий берег», Дананг',
  'Набережная реки, 5',
  'Youht Park, Nha Trang, Khánh Hòa',
];

// «Место проведения:» без адреса — ярлык снимается, строка отсекается
MUST_JUNK.push('Место проведения: На берегу залива', 'проведения: На берегу залива', 'На берегу залива', 'На берегу залива; Youht Park', 'на берегу озера');
let ok = 0, bad = [];
for (const s of MUST_JUNK) (isJunkAddress(s) ? ok++ : bad.push(`НЕ отсечён: ${s}`));
for (const s of MUST_PASS) (!isJunkAddress(s) ? ok++ : bad.push(`ЛОЖНО отсечён: ${s}`));
console.log(`юнит: ${ok}/${MUST_JUNK.length + MUST_PASS.length}`, bad.length ? bad : 'OK');

// --- регресс по всей базе: какие адреса фильтр ловит сейчас ---
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) { console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,start_date,website');
const junk = rows.filter(r => r.address && isJunkAddress(r.address));
const liveJunk = junk.filter(r => r.status !== 'archived');
console.log(`всего строк ${rows.length}; адрес-мусор ${junk.length}, из них живых ${liveJunk.length}`);
for (const r of liveJunk) {
  console.log(`  ${r.id.slice(0,8)} ${r.status} | ${r.title_ru || r.title} | ${r.city} ${r.start_date} | "${r.address}" | ${r.website || 'САЙТ=НЕТ'}`);
}
