// Перенос проверенной координаты площадки на её карточки, стоящие на центровом фолбэке города.
//
// Источник координаты — карточка-«сосед» ТОЙ ЖЕ площадки в нашей базе, чья точка пришла
// из ленты источника (cyprusnow/cyprus.bz, 7 знаков) и подтверждена несколькими прогонами
// сборщика. Карточки-цели (cyprus.bz) стоят на центре города: embed-координаты у них
// фолбэк (аудит dot-cy-bz-embed-fuzzy-audit).
//
// Страховки: цель обязана быть на центровом фолбэке; адрес цели обязан называть площадку;
// сдвиг > 50 м; city не меняется. DRY по умолчанию, APPLY=1 — применять.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// Центровые фолбэки сборщика (Лимасол, Никосия) — с них переносим.
const FALLBACKS = ['34.7071,33.0226', '35.1856,33.3823'];

const GROUPS = [
  {
    venue: 'Opus Events Venue',
    token: 'opus events venue',
    point: '34.6748699,33.0379258',
    evidence: 'соседи той же площадки из ленты cyprusnow: 9cc35890 «Spicy Island Halloween Edition» 23.10, a07be77b «Сейсмос Хэллоуин», 6ceca946 — все 34.6748699,33.0379258 (7 знаков, 4 прогона сборщика)',
    targets: ['07ea07d3', '36a3abc4', '4393533a', '4f513d0f'],
  },
  {
    venue: 'St Raphael Resort',
    token: 'st raphael resort',
    point: '34.7131365,33.1674229',
    evidence: 'соседи: 1279fbd6 (адрес «Отель St Raphael Resort & Marina», точка проверена по странице cyprus.bz в запуске 56), 2856f815, 9246b252, 9fc80d10 — все 34.7131365,33.1674229',
    // 22baf109 — живой близнец 9fc80d10 («Sum It Up 2026», 12–13.11, та же площадка):
    // не переносим, а архивируем через dot-lang-dupe-fix.mjs
    targets: ['14add4cd'],
  },
  {
    venue: 'Ktima Camelot',
    token: 'camelot',
    point: '35.0793206,33.193694',
    evidence: 'соседи из ленты cyprusnow: 0f7f3324 «yBRIS от Tempus Tribus» 05.12, 14f32b9b «Psyloween at Ktima Camelot» 31.10, 6def3647 — все 35.0793206,33.193694',
    // 0734f033 — живой близнец 14f32b9b (Psyloween 31.10 20:00, «Infinity Crew», та же площадка):
    // не переносим, а архивируем через dot-lang-dupe-fix.mjs
    targets: ['b1fb7f9e'],
  },
  {
    venue: 'SynerJoy Music',
    token: 'synerjoy',
    point: '34.6786322,33.0413055',
    evidence: 'соседи той же площадки в базе (Лимасол): 4f9d9029 «Джаз-соул-фанк трио: концерт на крыше», 639ec44e и da530204 («SynerJoy Music, Arts & Creativity School»), f8f2bc67 «SYNERJOY Music» — все 34.6786322,33.0413055 (7 знаков, точка площадки, не центровой фолбэк)',
    targets: ['3ae3ae05'],
  },
];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date,website');
const dist = (a, b, c, d) => Math.round(Math.hypot((a - c) * 111320, (b - d) * 111320 * Math.cos((a * Math.PI) / 180)));

let ok = 0, skip = 0, err = 0;
for (const g of GROUPS) {
  const [glat, glng] = g.point.split(',').map(Number);
  console.log(`\n== ${g.venue} -> ${g.point}`);
  console.log(`   источник координаты: ${g.evidence}`);
  for (const p of g.targets) {
    const r = rows.find((x) => String(x.id).startsWith(p));
    if (!r) { console.log(`   [SKIP] ${p}: не найдена`); skip++; continue; }
    const cur = `${r.lat},${r.lng}`;
    const addr = (r.address || '').toLowerCase();
    if (r.status !== 'active') { console.log(`   [SKIP] ${p}: статус ${r.status}`); skip++; continue; }
    if (!FALLBACKS.includes(cur)) { console.log(`   [SKIP] ${p}: уже не на центровом фолбэке (${cur})`); skip++; continue; }
    if (!addr.includes(g.token)) { console.log(`   [SKIP] ${p}: адрес «${r.address}» не называет площадку`); skip++; continue; }
    const m = dist(r.lat, r.lng, glat, glng);
    if (m <= 50) { console.log(`   [SKIP] ${p}: сдвиг ${m} м`); skip++; continue; }
    console.log(`   ${APPLY ? 'ПРИМЕНЯЮ' : 'DRY'} ${p} ${cur} -> ${g.point} (${m} м) | ${r.city} | ${(r.title_ru || r.title).slice(0, 45)}`);
    if (!APPLY) { ok++; continue; }
    const { data, error } = await db.from('events').update({ lat: glat, lng: glng }).eq('id', r.id).select('id');
    if (error) { console.log(`     ОШИБКА: ${error.message}`); err++; } else { console.log(`     записано ${data.length}`); ok++; }
  }
}
console.log(`\nГотово: применено ${ok}, пропущено ${skip}, ошибок ${err}, режим ${APPLY ? 'APPLY' : 'DRY'}`);

if (APPLY) {
  const after = await selectAll(db, 'events', 'id,status,city,address,lat,lng');
  for (const g of GROUPS) {
    for (const p of g.targets) {
      const r = after.find((x) => String(x.id).startsWith(p));
      if (r) console.log(`контроль ${r.id.slice(0, 8)} ${r.status} ${r.lat},${r.lng} | ${r.city} | ${(r.address || '').slice(0, 45)}`);
    }
  }
}
