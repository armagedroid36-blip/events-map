#!/usr/bin/env node
// Запуск 843: карточки-АГРЕГАТЫ целого прогона при наличии карточек отдельных окон/дат
// той же постановки на той же площадке (класс «один спектакль — 7 карточек на карте,
// одна из них печатает непрерывный интервал в 44 дня»).
// Зонд: %LOCALAPPDATA%\Temp\probe-843.py по прод-снапшоту 1307 карточек (gen 08.11 21:23Z).
// Арбитр: лента Cyprus Now (прямой запрос, RU-IP): «39 Steps» = 6 записей
// series_count 7, series_first 07.11, series_last 18.12, у каждой venue Θέατρο Δέντρο,
// 18:00Z = 20:00 местного — т.е. прогон идёт ОКНАМИ по выходным, а агрегат 06.11→20.12
// (сплошняком, старт на день раньше series_first) — артефакт, не событие.
// Правило: агрегат архивируется, окна/даты остаются; RU-название у окон есть в title_ru,
// поэтому русскоязычная витрина ничего не теряет.
// Использование:  node aggregate-run-843-apply.mjs            (dry-run)
//                 APPLY=1 node aggregate-run-843-apply.mjs     (запись)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении'); process.exit(2); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// agg — карточка-агрегат (архивируем); keep — карточки окон, которые остаются живыми
const ITEMS = [
  {
    agg: 'ebca48f3-2d5f-44d2-b4aa-e12540cf64a5', title: 'The 39 Steps',
    start: '2026-11-06', end: '2026-12-20',
    keep: ['4bd88dd4-3a8e-4570-8bce-c4ba58ef35a7', '8695950f-b629-4afb-8358-54a6c0302490',
           'df899591-7ca8-4e87-a5e7-ab684841dc09', '287ff3c2-8258-4149-87fd-0060281571f2',
           '5a4e3773-fae5-4946-b821-df0833eba67f', '5c446527-93e2-45f4-8c3f-d49f67267b66'],
    why: 'CN ?q=39 steps: 6 записей, series_count 7, series_first 07.11, series_last 18.12, venue Θέατρο Δέντρο, 18:00Z=20:00 местного ⇒ прогон идёт окнами по выходным; в базе 6 живых карточек окон (13-15.11 … 18-20.12). Агрегат печатает сплошной интервал 06.11→20.12 (старт на день раньше series_first) и стоит на чужом пине 35.1686,33.3578 — в 3.3 км от Θέατρο Δέντρο (35.1778102,33.391543)',
  },
  {
    agg: 'd94253d8-ada4-4beb-b3f8-ce0088b4409d', title: 'Большая книга маленьких существ',
    start: '2026-10-25', end: '2026-12-20',
    keep: ['dc6d21d7-feac-4553-b075-cd0d24071e64'],
    why: 'агрегат «25.10→20.12 ежедневно 10:00» при живых карточках воскресных показов Театра Дионисоса 15.11/22.11/29.11/06.12/13.12/20.12 в 11:00 (та же площадка, пин 35.1686,33.3579); у окон есть title_ru «Большая книга маленьких существ» ⇒ архив агрегата витрину не обедняет',
  },
  {
    agg: '164b5f2a-5d70-4a07-b20b-4a84c333f728', title: 'Фрост/Никсон',
    start: '2026-11-07', end: '2026-12-18',
    keep: ['c8d3237c-0f41-458a-b3b4-b9e844cdbb13', '84e226c8-76b2-465d-8a70-70656b34c5d1',
           '9ef59c8d-2792-4a1e-8d1e-5f246afc2f96', '14d893f4-bbca-439a-9d77-6fbb9c63013b'],
    why: 'агрегат 07.11→18.12 20:00 при 11 живых карточках постановки в ΘΟΚ (08.11, 11.11, 13-15.11, 18.11, 20-22.11, 25.11, 27-29.11, 02.12, 04-06.12, 18.12 Пафос); у греческих окон title_ru = «Фрост/Никсон» ⇒ дубль, а не отдельное событие. Пин агрегата 35.1727,33.3555 в 450 м от ΘΟΚ (35.1681606,33.35533)',
  },
];

const q = (id) => `${URL_}/rest/v1/events?id=eq.${id}&select=id,title,status,start_date,end_date,start_time,city,address`;

async function get(id) {
  const r = await fetch(q(id), { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return rows[0] || null;
}

let done = 0, skipped = 0, failed = 0;
console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; карточек ${ITEMS.length}`);

for (const it of ITEMS) {
  let row;
  try { row = await get(it.agg); }
  catch (e) { console.log(`! ${it.agg.slice(0, 8)} ${e.message}`); failed++; continue; }
  if (!row) { console.log(`- ${it.agg.slice(0, 8)} не найдена — пропуск`); skipped++; continue; }
  if (row.status !== 'active') { console.log(`- ${it.agg.slice(0, 8)} status=${row.status} — пропуск`); skipped++; continue; }
  if (row.start_date !== it.start || row.end_date !== it.end) {
    console.log(`- ${it.agg.slice(0, 8)} окно ${row.start_date}→${row.end_date} ≠ ожидаемого ${it.start}→${it.end} — пропуск`);
    skipped++; continue;
  }
  if (!(row.title || '').toLowerCase().includes(it.title.toLowerCase().slice(0, 8))) {
    console.log(`- ${it.agg.slice(0, 8)} заголовок «${row.title}» не совпал — пропуск`); skipped++; continue;
  }
  console.log(`+ ${it.agg.slice(0, 8)} «${row.title}» ${row.start_date}→${row.end_date} → archived (окон остаётся ${it.keep.length})`);
  if (!APPLY) { done++; continue; }
  const body = {
    status: 'archived',
    auto_review: { engine: 'dot-manual', verdict: 'reject', reason: 'duplicate', note: it.why, at: new Date().toISOString() },
  };
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.agg}&status=eq.active`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  if (!r.ok) { const t = await r.text(); console.log(`! PATCH ${r.status}: ${t.slice(0, 200)}`); failed++; continue; }
  const rows = await r.json();
  if (rows.length !== 1) { console.log(`! PATCH вернул ${rows.length} строк — не 1`); failed++; continue; }
  console.log(`  readback ${rows[0].id.slice(0, 8)} = ${rows[0].status}`);
  done++;
}

console.log(`итого: правок ${done}, пропущено ${skipped}, ошибок ${failed}`);
