#!/usr/bin/env node
// Запуск 849: серии «Εργαστήριο Μνήμης» (мастерские памяти) — карточка-АГРЕГАТ печатает
// сплошной интервал там, где источник держит отдельные занятия по дням.
// Зонд: %LOCALAPPDATA%\Temp\probe-849.py по прод-снапшоту (gen 08.11 21:23Z, 1307 карточек).
// Арбитр: лента Cyprus Now, прямой запрос с RU-IP (прокси не нужен):
//   ?q=flasou  -> ОДНА запись 2026-11-15T16:00:00Z (=18:00 местного), end_at null, series_count 1
//                 ⇒ мастерская во Флассу — одно занятие 15.11 18:00, отдельного 08.11 нет;
//   ?q=Μαλιά   -> ТРИ записи 14.11 / 21.11 / 28.11 по 14:00Z (=16:00), series_count 3,
//                 series_first 14.11, series_last 28.11, у 14.11 и 21.11 end_at null
//                 ⇒ в Малии три занятия, а не непрерывные 16 дней.
// Правила:
//   · 2809f6ab (Малия) — СУЗИТЬ интервал до своего дня (end_date 14.11, end_time null):
//     отдельной карточки на 14.11 нет, архив потерял бы занятие; занятия 21.11 и 28.11 живут своими карточками.
//   · d7470ec1 (Флассу) — АРХИВ: единственная реальная дата 15.11 18:00 уже покрыта живой карточкой
//     a0a55002 «Εργαστήριο Μνήμης στη Φλάσου», у агрегата ложный старт 08.11 10:00.
// Использование:  node dots/events/memory-run-849-apply.mjs            (dry-run)
//                 APPLY=1 node dots/events/memory-run-849-apply.mjs     (запись)
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
    id: '2809f6ab-1950-4a38-a92d-0e012a2e4c3c',
    title: 'Мастерская памяти в Малии',
    start: '2026-11-14', end: '2026-11-29',
    mode: 'shrink', nextEnd: '2026-11-14', nextEndTime: null,
    why: 'CN ?q=Μαλιά: series_count 3, занятия 14/21/28.11 по 16:00 (14:00Z), end_at null ⇒ агрегат 14→29.11 печатает ложную непрерывность; карточки 21.11 (ffd6b37c) и 28.11 (898c3940) живут отдельно, 14.11 отдельной нет — сужаем интервал, а не архивируем',
  },
  {
    id: 'd7470ec1-8b21-4d00-aa6e-770f5952d989',
    title: 'Мастерская памяти во Флассу',
    start: '2026-11-08', end: '2026-11-15',
    mode: 'archive',
    why: 'CN ?q=flasou: ОДНА запись 15.11 16:00Z (=18:00), series_count 1 ⇒ событие одно и оно уже покрыто живой карточкой a0a55002 (15.11 18:00); ложный старт 08.11 10:00',
  },
];

const q = (id) => `${URL_}/rest/v1/events?id=eq.${id}&select=id,title,status,start_date,end_date,start_time,end_time,city`;
async function get(id) {
  const r = await fetch(q(id), { headers: H });
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
  if (row.start_date !== it.start || row.end_date !== it.end) {
    console.log(`- ${p} интервал ${row.start_date}→${row.end_date} ≠ ожидаемого ${it.start}→${it.end} — пропуск`);
    skipped++; continue;
  }
  if (!(row.title || '').toLowerCase().includes(it.title.toLowerCase().slice(0, 12))) {
    console.log(`- ${p} заголовок «${row.title}» не совпал — пропуск`); skipped++; continue;
  }

  const body = it.mode === 'archive'
    ? { status: 'archived', auto_review: { verdict: 'reject', reason: 'duplicate', note: it.why } }
    : { end_date: it.nextEnd, end_time: it.nextEndTime };

  console.log(`${it.mode === 'archive' ? 'архив' : 'сужение'}: ${p} «${row.title}» ${row.start_date}→${row.end_date} ⇒ ${JSON.stringify(body)}`);
  if (!APPLY) continue;

  try {
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const back = (await r.json())[0];
    if (!back) throw new Error('PATCH вернул пусто (страховка status=eq.active не совпала)');
    const ok = it.mode === 'archive'
      ? back.status === 'archived'
      : back.end_date === it.nextEnd && (back.end_time === null || back.end_time === it.nextEndTime);
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} ${back.start_date}→${back.end_date} ${back.start_time}→${back.end_time}`);
    ok ? done++ : failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done || ITEMS.length - skipped - failed}, пропущено ${skipped}, ошибок ${failed}`);
