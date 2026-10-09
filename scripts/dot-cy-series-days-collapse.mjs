// dot-cy-series-days-collapse.mjs
// Класс: агрегатор Cyprus Now отдаёт МНОГОДНЕВНОЕ событие отдельной записью на каждый день.
// Симптом: на карте одно событие стоит N пинами на N подряд идущих дней (IDO: 7 пинов 09-15.10).
// Лечение: группу одного события свести к ОДНОЙ карточке — keep = самый ранний день (ему проставляется
// end_date = последний день группы), остальные дни -> archived. Дни при этом не теряются (интервал).
// Приёмка источника: GET https://cyprusnow.app/api/events?q=ido — 7 записей по дням, одна площадка
// Larnaka Multi-functional Centre 34.9108675,33.6329481; интервальная запись «IDO World Championships 2026»
// (10.10T06:00Z -> 15.10T06:00Z) подтверждает, что это ОДНО многодневное событие.
// Запуск: DRY по умолчанию, APPLY=1 для записи. База — только service-role.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!SUPABASE_URL || !KEY) { console.error('Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE (запускать через node --env-file=.env)'); process.exit(1); }
const db = createClient(SUPABASE_URL, KEY);

const GROUPS = [
  {
    name: 'IDO Couple Dance Championships & Diamond Grand Prix, Ларнака',
    ids: ['4847d8fa', '236b2e12', '1515702a', '5522f8b8', '0e59f36d', 'd8527a54', '96c12f0d'],
    title: 'IDO Couple Dance Championships & Diamond Grand Prix',
    city: 'Ларнака, Кипр',
    address: 'Larnaka Multi-functional Centre',
    lat: 34.9108675,
    lng: 33.6329481,
    first: '2026-10-09',
    last: '2026-10-15',
    source: 'cyprusnow.app/event/ido-couple-dance-championships-diamond-grand-prix',
  },
  // Ниже — группы-СЕРИИ: добавлены, чтобы страховка SERIES_DO_NOT_COLLAPSE срабатывала при каждом прогоне.
  {
    name: 'Ψαθαρούδες (Ларнака, Kalavasos Village Square) — СЕРИЯ 4 представлений',
    ids: ['3976c97c', 'edc69c83', '97f93c29', 'de689d06'],
    title: 'Ψαθαρούδες',
    city: 'Ларнака, Кипр',
    address: 'Kalavasos Village Square',
    lat: 34.7717166,
    lng: 33.296221,
    first: '2026-10-18',
    last: '2026-11-01',
    source: 'cyprusnow.app/event/ψαθαρούδες',
  },
  {
    name: 'Μια νύκτα στον παράδεισο (Пафос, Markideio) — СЕРИЯ 3 представлений',
    ids: ['cd3c378c', 'fc1dbba1', '89159e6b'],
    title: 'Μια νύκτα στον παράδεισο (Χειμερινή Περιοδεία) στη',
    city: 'Пафос, Кипр',
    address: 'Markideio Municipal Theatre',
    lat: 34.7781598,
    lng: 32.4232334,
    first: '2027-01-22',
    last: '2027-01-24',
    source: 'cyprusnow.app/event/μια-νύκτα-στον-παράδεισο-χειμερινή-περιοδεία-στην-πάφο',
  },
];

// СЕРИИ, которые сворачивать НЕЛЬЗЯ (проверено по ленте источника 10.10.2026).
// Отличие от IDO: там источник, кроме записей по дням, отдаёт независимую запись-интервал
// одного турнира, а сам чемпионат — одно событие на одной площадке. Здесь источник моделирует
// СЕРИЮ отдельных представлений: у каждой записи `series_count` = число вечеров и `series_first/last`
// (Ψαθαρούδες, Kalavasos Village Square: 4 записи 18/25.10, 28.10, 01.11, series_count=4, end_at у всех null;
// «Μια νύκτα στον παράδεισο», Пафос, Markideio Municipal Theatre: 3 записи 22/23/24.01.2027, series_count=3).
// Свернуть такую группу = удалить с карты отдельные спектакли. Проверка — `dot-cy-series-guard-probe.mjs`.
const SERIES_DO_NOT_COLLAPSE = [
  { title: 'Ψαθαρούδες', sessions: 4, venue: 'Kalavasos Village Square', src: 'series_count=4, 18.10/25.10/28.10/01.11' },
  { title: 'Μια νύκτα στον παράδεισο (Χειμερινή Περιοδεία) στη', sessions: 3, venue: 'Markideio Municipal Theatre', src: 'series_count=3, 22/23/24.01.2027' },
];

const TOL = 0.0002;
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= TOL;

function fail(g, msg) { console.log(`  ОТКЛОНЕНО ${g.name}: ${msg}`); return false; }

async function run(g) {
  console.log(`== ${g.name}`);
  const series = SERIES_DO_NOT_COLLAPSE.find(s => g.title.startsWith(s.title));
  if (series) {
    console.log(`  ОТКЛОНЕНО: источник моделирует СЕРИЮ из ${series.sessions} представлений (${series.src}, ${series.venue}) — дни не терять`);
    return;
  }
  const { data, error } = await db.from('events')
    .select('id,title,start_date,end_date,start_time,city,address,lat,lng,status,website,category_id,source_type')
    .eq('title', g.title).eq('city', g.city);
  if (error) { console.log('  ОШИБКА ЧТЕНИЯ', error.message); return; }
  if (!data || data.length !== g.ids.length) return fail(g, `прочитано ${data ? data.length : 0} карточек, ожидалось ${g.ids.length}`);
  const short = new Set(data.map(r => r.id.slice(0, 8)));
  const wrong = g.ids.filter(i => !short.has(i));
  if (wrong.length) return fail(g, `не совпали карточки: ${wrong.join(', ')}`);
  const rows = data.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  for (const r of rows) console.log(`  ${r.id} ${r.start_date} ${r.status} ${r.start_time} ${r.category_id} | ${r.website}`);
  if (rows.some(r => r.status !== 'active')) return fail(g, 'не все карточки active');
  if (rows.some(r => r.title !== g.title)) return fail(g, 'названия различаются');
  if (rows.some(r => r.city !== g.city)) return fail(g, 'city различаются');
  if (rows.some(r => r.address !== g.address)) return fail(g, 'адреса различаются');
  if (rows.some(r => !near(r.lat, g.lat) || !near(r.lng, g.lng))) return fail(g, 'координаты различаются');
  if (rows.some(r => !String(r.website || '').includes(g.source))) return fail(g, 'сайт не тот же слаг источника');
  const dates = rows.map(r => r.start_date);
  if (new Set(dates).size !== dates.length) return fail(g, 'даты повторяются');
  if (dates[0] !== g.first || dates[dates.length - 1] !== g.last) return fail(g, `крайние даты ${dates[0]}..${dates[dates.length - 1]} != ${g.first}..${g.last}`);
  const times = new Set(rows.map(r => r.start_time));
  if (times.size !== 1) return fail(g, 'время начала различается');
  const keep = rows[0];
  const drops = rows.slice(1);
  console.log(`  KEEP ${keep.id} ${keep.start_date} (end_date ${keep.end_date || 'null'} -> ${g.last}), ARCHIVE ${drops.map(d => d.id).join(', ')}`);
  if (!APPLY) { console.log('  DRY: без записи (APPLY=1 для применения)'); return; }
  const up = await db.from('events').update({ end_date: g.last }).eq('id', keep.id).select('id');
  if (up.error) { console.log('  ОШИБКА KEEP', up.error.message); return; }
  console.log(`  keep обновлён: ${(up.data || []).length} строк`);
  let arch = 0;
  for (const d of drops) {
    const res = await db.from('events').update({ status: 'archived' }).eq('id', d.id).eq('status', 'active').select('id');
    if (res.error) { console.log(`  ОШИБКА ARCHIVE ${d.id}:`, res.error.message); continue; }
    arch += (res.data || []).length;
  }
  console.log(`  заархивировано: ${arch} из ${drops.length}`);
}

for (const g of GROUPS) { await run(g); }
console.log('Готово.');
