#!/usr/bin/env node
// Запуск 859: тур «Щелкунчик» — у карточек `end_time` от ЧУЖОГО показа тура / заглушка конца дня.
//
// Фронт: лид 857 «533926bd Щелкунчик 28.11 14:30 у карточки vs 15:30 у ленты Cyprus Now».
// Арбитр — блок «🗓️ Πρόγραμμα» страницы записи ленты CN
// (cyprusnow.app/event/the-nutcracker-ballet-2026-11-28, через прокси 10809, 334 583 б):
//   «Σάββατο, 28 Νοεμβρίου 2026 | 14:30 (Παττίχειο Θέατρο Λεμεσού);
//    Κυριακή, 29 Νοεμβρίου 2026 | 15:00 (Δημοτικό Θέατρο Λευκωσίας);
//    Δευτέρα, 30 Νοεμβρίου 2026 | 18:30 (Θέατρο Μαρκίδειο Πάφου)»
//   ⇒ НАЧАЛО 28.11 14:30 у карточки ВЕРНОЕ (в API `start_at` 13:30Z — сдвиг агрегатора на час),
//     править `start_time` не нужно.
//
// Но `end_time 18:30` у 533926bd — это время ПАФОССКОГО показа тура (30.11 18:30), т.е. в поле
// конца однодневной карточки попало окно гастроли (у записи CN `end_at` 30.11 16:30Z = 18:30
// местного). У лимасольской карточки это артефакт: спектакль один, 14:30, второго сеанса нет.
// Лечение — `end_time = null` (конец показа не выдумывать).
//
// Вторая карточка того же тура 790e067f (01.12, Маркидеио Пафос 18:30): `end_time 23:59` —
// заглушка «конец дня» агрегатора (у записи CN `end_at` 21:59Z = 23:59 местного), балет 5.5 ч
// не идёт ⇒ тоже `end_time = null`. Дату (01.12) НЕ трогаю: афиша тура в странице CN называет
// Пафос 30.11, а отдельная запись ленты — «1 December · 18:30»; источники расходятся,
// при расхождении карточку не трогаем.
//
// Использование:  node dots/events/nutcracker-859-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/nutcracker-859-apply.mjs   (запись)
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
    id: '533926bd-9373-485a-8725-56139ce4921e',
    title: 'Щелкунчик',
    start: '2026-11-28',
    startTime: '14:30:00',
    oldEnd: '18:30:00',
    why: 'программа тура в записи CN: 28.11 14:30 Паттихио — один показ; 18:30 это пафосский показ 30.11',
  },
  {
    id: '790e067f', // полный uuid подставляется ниже из строки
    title: 'The Nutcracker',
    start: '2026-12-01',
    startTime: '18:30:00',
    oldEnd: '23:59:00',
    why: 'запись CN: end_at 21:59Z = 23:59 местного = заглушка «конец дня», балет столько не идёт',
  },
];

const SEL = 'id,title,status,start_date,start_time,end_time';
async function get(id) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&select=${SEL}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())[0] || null;
}

// для второй цели id записан префиксом — ищем полный uuid по дате и времени
async function findFull(prefix, start, startTime) {
  const r = await fetch(`${URL_}/rest/v1/events?start_date=eq.${start}&start_time=eq.${startTime}&select=${SEL}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rows = (await r.json()).filter(x => x.id.startsWith(prefix));
  return rows.length === 1 ? rows[0].id : null;
}

let done = 0, skipped = 0, failed = 0;
console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${ITEMS.length}`);

for (const it of ITEMS) {
  const p = it.id.slice(0, 8);
  let id = it.id;
  try {
    if (id.length < 36) {
      const full = await findFull(id, it.start, it.startTime);
      if (!full) { console.log(`- ${p} не найдена однозначно — пропуск`); skipped++; continue; }
      id = full;
    }
    const row = await get(id);
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
    console.log(`        арбитр: ${it.why}`);
    if (!APPLY) { done++; continue; }

    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&status=eq.active&end_time=eq.${it.oldEnd}`, {
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
