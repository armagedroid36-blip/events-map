#!/usr/bin/env node
// Запуск 899: карточки, у которых `end_time` РАНЬШЕ `start_time` в тот же день —
// логически невозможный интервал (конец не может быть до начала).
//
// Класс найден офлайн-переписью прод-снапшота 15.11.2026 (`probe899.py`, 1307 карточек):
// «end<start» по датам — 0, а «тот же день, end_time < start_time» — 4 карточки.
// Причина та же, что в 859: в поле конца попал час ДРУГОГО сеанса/площадки
// (у «Μια Κύπρος παραμύθκια» 15:30 → 11:00, у Little Prince 19:00 → 18:30).
//
// Лечение — `end_time = null` (конец показа не выдумываем): карточка печатает только начало.
// Correct value из источника не подставляю — арбитра по каждой из 4 записей в этом
// запуске не снимал, а неверный час хуже пустого поля.
//
// Использование:  node dots/events/endtime-899-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/endtime-899-apply.mjs   (запись)
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
    id: 'c3422b71-6e52-4ba8-8508-6cac207ab984',
    title: 'παραμύθκια',
    start: '2026-11-21',
    startTime: '15:30:00',
    oldEnd: '11:00:00',
    why: 'конец 11:00 раньше начала 15:30 — в end_time попал утренний сеанс другой даты',
  },
  {
    id: '36f642fa-3dd3-4a3a-b61a-1b16e05c1c6a',
    title: 'κυνηγώντας',
    start: '2026-12-02',
    startTime: '19:00:00',
    oldEnd: '11:30:00',
    why: 'конец 11:30 раньше начала 19:00 — чужой сеанс',
  },
  {
    id: '47a53a7e-485d-4105-8c35-f7faa862fa98',
    title: 'παραμύθκια',
    start: '2026-12-05',
    startTime: '15:30:00',
    oldEnd: '11:00:00',
    why: 'конец 11:00 раньше начала 15:30 — тот же сеансный артефакт, что 21.11',
  },
  {
    id: 'eeb244ff-57c1-42e5-8fe1-b85aed1a600e',
    title: 'little prince',
    start: '2026-12-05',
    startTime: '19:00:00',
    oldEnd: '18:30:00',
    why: 'конец 18:30 раньше начала 19:00 — окно гастроли/чужой показ',
  },
];

const SEL = 'id,title,status,start_date,start_time,end_time';
async function get(id) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&select=${SEL}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())[0] || null;
}

let done = 0, skipped = 0, failed = 0;
console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${ITEMS.length}`);

for (const it of ITEMS) {
  const p = it.id.slice(0, 8);
  try {
    const row = await get(it.id);
    if (!row) { console.log(`- ${p} не найдена — пропуск`); skipped++; continue; }
    if (row.status !== 'active') { console.log(`- ${p} status=${row.status} — пропуск`); skipped++; continue; }
    if (!(row.title || '').toLowerCase().includes(it.title.toLowerCase())) {
      console.log(`- ${p} заголовок «${row.title}» не совпал — пропуск`); skipped++; continue;
    }
    if (row.start_date !== it.start || row.start_time !== it.startTime) {
      console.log(`- ${p} дата/время уже другие (${row.start_date} ${row.start_time}) — пропуск`); skipped++; continue;
    }
    if (row.end_time !== it.oldEnd) {
      console.log(`- ${p} end_time уже другой (${row.end_time}) — пропуск`); skipped++; continue;
    }
    console.log(`правка: ${p} «${row.title}» ${row.start_date} ${row.start_time}: end_time ${it.oldEnd} ⇒ null`);
    console.log(`        причина: ${it.why}`);
    if (!APPLY) { done++; continue; }

    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active&end_time=eq.${it.oldEnd}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ end_time: null }),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const back = (await r.json())[0];
    if (!back) throw new Error('PATCH вернул пусто (страховки status/end_time не совпали)');
    const ok = back.end_time === null;
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} end_time=${back.end_time}`);
    if (ok) done++; else failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done}, пропущено ${skipped}, ошибок ${failed}`);
