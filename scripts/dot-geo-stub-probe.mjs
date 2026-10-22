// Точка «События»: поиск ЖИВЫХ карточек, которые стоят РОВНО на центровой константе
// (фолбэк-пины сборщика). Только чтение.
//
// История: до 399 зонд считал кандидатом лишь карточку, у которой адрес называет ДРУГОЙ
// населённый пункт, поэтому при 86 живых карточках на центрах печатал «кандидатов 0» —
// слепое пятно (запуск 397). Настоящий класс: пин на центре города, а адрес называет
// площадку/улицу, т.е. место известно, а координата не проставлена.
//
// Источники центров — единые модули проекта, не рукописные копии:
//   cy-districts.mjs -> CY_CITY_CENTERS (сверка с CY_CITIES сборщика — dot-centers-coverage-check)
//   bali-districts.mjs -> BALI_DISTRICT_CENTERS
//   collect-tg.mjs -> фолбэки Нячанга и Дананга
//
// Ручки: PROBE_STATUS=active (по умолчанию) | active,moderation | all
//        PROBE_LIMIT=N — сколько строк печатать в каждой секции (по умолчанию 60)
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { CY_CITY_CENTERS } from './cy-districts.mjs';
import { BALI_DISTRICT_CENTERS } from './bali-districts.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,start_time,source_type,website');

const TOL = 0.0012; // ~130 м: точка площадки бывает в 300-500 м от центра, фолбэк лежит РОВНО на константе
const STATUS = (process.env.PROBE_STATUS || 'active').toLowerCase();
const LIMIT = Number(process.env.PROBE_LIMIT || 60);

const CENTERS = [];
for (const [name, lat, lng] of CY_CITY_CENTERS) CENTERS.push({ group: 'Кипр', name, lat, lng });
// BALI_DISTRICT_CENTERS: { <латинский ключ>: { lat, lng } } — значения объектами, не массивами
for (const [name, c] of Object.entries(BALI_DISTRICT_CENTERS)) CENTERS.push({ group: 'Бали', name, lat: c.lat, lng: c.lng });
CENTERS.push({ group: 'Вьетнам', name: 'Нячанг', lat: 12.2388, lng: 109.1967 });
CENTERS.push({ group: 'Вьетнам', name: 'Дананг', lat: 16.0544, lng: 108.2022 });

const norm = (s) => String(s || '').toLowerCase().replace(/[ё]/g, 'е').replace(/[^a-zа-я0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();

// «содержательный» адрес = после вычета города/района и слова «Кипр»/«Бали» остаётся название места
function addressTail(addr, city, centerName) {
  let t = norm(addr);
  for (const w of [city, centerName, 'кипр', 'cyprus', 'бали', 'bali', 'индонезия', 'вьетнам', 'vietnam', 'kec', 'kabupaten', 'kota']) {
    const n = norm(w);
    if (n) t = t.split(' ').filter((x) => x !== n).join(' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

const live = rows.filter((r) => (STATUS === 'all' ? true : STATUS.split(',').includes(r.status)));
const onCenter = [];
for (const r of live) {
  if (r.lat == null || r.lng == null) continue;
  const c = CENTERS.find((x) => Math.abs(x.lat - r.lat) <= TOL && Math.abs(x.lng - r.lng) <= TOL);
  if (!c) continue;
  const city = (r.city || '').split(',')[0].trim();
  const tail = addressTail(r.address, city, c.name);
  onCenter.push({ r, c, city, tail, hasAddr: !!String(r.address || '').trim() });
}

const withTail = onCenter.filter((x) => x.tail.length >= 3);
const noAddr = onCenter.filter((x) => !x.hasAddr);
const cityOnly = onCenter.filter((x) => x.hasAddr && x.tail.length < 3);

const byCity = {};
for (const x of onCenter) byCity[x.c.name] = (byCity[x.c.name] || 0) + 1;
const withTailByCity = {};
for (const x of withTail) withTailByCity[x.c.name] = (withTailByCity[x.c.name] || 0) + 1;

const line = (x) => `${x.r.id.slice(0, 8)} | ${x.r.status} | ${x.c.name} | ${x.r.lat},${x.r.lng} | ${(x.r.title_ru || x.r.title || '').slice(0, 46)} | ${String(x.r.address || '—').slice(0, 70)}`;

console.log(`режим статусов: ${STATUS}; живых строк ${live.length}; центров в справочнике ${CENTERS.length}`);
console.log(`НА ЦЕНТРОВЫХ КОНСТАНТАХ: ${onCenter.length}`, JSON.stringify(byCity));
console.log(`КАНДИДАТЫ (адрес называет площадку/улицу): ${withTail.length}`, JSON.stringify(withTailByCity));
for (const x of withTail.slice(0, LIMIT)) console.log('  кандидат |', line(x));
console.log(`адрес = только город/страна: ${cityOnly.length}`);
for (const x of cityOnly.slice(0, LIMIT)) console.log('  без улики |', line(x));
console.log(`адреса нет вовсе: ${noAddr.length}`);
for (const x of noAddr.slice(0, LIMIT)) console.log('  без адреса |', line(x));
