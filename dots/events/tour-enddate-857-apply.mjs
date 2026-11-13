#!/usr/bin/env node
// Запуск 857: карточка-АГРЕГАТ гастрольного тура печатает ОКНО ТУРА как интервал.
// Класс найден офлайн по прод-снапшоту (gen 08.11 21:23Z, 1307 карточек) новым зондом
// probe-titlepair-857.py: сверка title ↔ title_ru ↔ title_en ВНУТРИ карточки
// (числа 0 расхождений, города 4 лида — 3 законных тура, 1 уже закрыт в cardcity-856).
// Побочно выяснилось, что у одного тура интервал = окно гастроли, а не длительность события.
//
// f717d28f «Балет «Спартак»: … в Никосии и Лимассоле» 27.11 19:30 → end_date 28.11, end_time 20:00
//   арбитр — лента Cyprus Now, прямой запрос с RU-IP (прокси не нужен):
//     GET https://cyprusnow.app/api/events?q=spartacus&limit=8
//     -> 2026-11-27T17:30:00Z (=19:30 местного, UTC+2) venue «Nicosia Municipal Theatre/
//        Pattihio Theatre Limassol», city Nicosia, series_count 1
//     -> 2026-11-28T18:00:00Z (=20:00) venue «Pattihio Municipal Theatre», city Limassol
//   то есть это ДВА разных вечера в разных городах, а не двухдневное событие в Никосии.
//   Второй вечер уже стоит СВОЕЙ живой карточкой: c2c6244e «Spartacus Ballet»
//   28.11 20:00, Лимасол, Pattihio Municipal Theatre — потерь от сужения нет.
//   `end_time 20:00` у карточки Никосии — начало лимасольского показа, попавшее в то же окно.
//   ⇒ end_date = 2026-11-27, end_time = null (вечер один, начало 19:30).
//
// Использование:  node dots/events/tour-enddate-857-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/tour-enddate-857-apply.mjs   (запись)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении'); process.exit(2); }

const H = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY,
  'Content-Type': 'application/json',
};

const ITEMS = [
  {
    id: 'f717d28f-d49e-44e4-aa0e-2a39a4b821d2',
    title: 'Спартак',
    start: '2026-11-27',
    fromCity: 'Никосия, Кипр',
    fromEnd: '2026-11-28',
    fromStartTime: '19:30',
    next: { end_date: '2026-11-27', end_time: null },
    why: 'CN ?q=spartacus: два вечера — 27.11 17:30Z=19:30 Никосия (Nicosia Municipal Theatre) и 28.11 18:00Z=20:00 Лимасол (Pattihio); лимасольский вечер держит живая карточка c2c6244e 28.11 20:00 ⇒ интервал 27→28.11 и end_time 20:00 — окно тура',
  },
];

const SEL = 'id,title,status,start_date,end_date,start_time,end_time,city';
async function get(id) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&select=${SEL}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())[0] || null;
}

let done = 0, skipped = 0, failed = 0;
console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${ITEMS.length}`);

for (const it of ITEMS) {
  const p = it.id.slice(0, 8);
  let row;
  try { row = await get(it.id); }
  catch (e) { console.log(`! ${p} ${e.message}`); failed++; continue; }
  if (!row) { console.log(`- ${p} не найдена — пропуск`); skipped++; continue; }
  if (row.status !== 'active') { console.log(`- ${p} status=${row.status} — пропуск`); skipped++; continue; }
  if (!(row.title || '').toLowerCase().includes(it.title.toLowerCase())) {
    console.log(`- ${p} заголовок «${row.title}» не совпал — пропуск`); skipped++; continue;
  }
  if (row.start_date !== it.start || row.city !== it.fromCity) {
    console.log(`- ${p} дата/город уже другие (${row.start_date} / ${row.city}) — пропуск`); skipped++; continue;
  }
  if (row.end_date !== it.fromEnd) {
    console.log(`- ${p} end_date уже ${row.end_date} — пропуск`); skipped++; continue;
  }
  if (String(row.start_time || '').slice(0, 5) !== it.fromStartTime) {
    console.log(`- ${p} start_time уже ${row.start_time} — пропуск`); skipped++; continue;
  }

  console.log(`правка: ${p} «${row.title}» ${row.start_date} ${row.start_time}: end_date ${row.end_date} ⇒ ${it.next.end_date}, end_time ${row.end_time} ⇒ null`);
  if (!APPLY) continue;

  try {
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active&end_date=eq.${it.fromEnd}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(it.next),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const back = (await r.json())[0];
    if (!back) throw new Error('PATCH вернул пусто (страховка status/end_date не совпала)');
    const ok = back.end_date === it.next.end_date && back.end_time === null;
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} ${back.start_date}→${back.end_date} time ${back.start_time}→${back.end_time}`);
    ok ? done++ : failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done || ITEMS.length - skipped - failed}, пропущено ${skipped}, ошибок ${failed}`);
