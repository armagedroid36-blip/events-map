#!/usr/bin/env node
// Запуск 866: карточка печатает ОКНО ГАСТРОЛИ как интервал (тот же класс, что 857/859).
// Класс найден сверкой карточек ближнего окна 13–21.11 со СВЕЖЕЙ лентой Cyprus Now
// (зонд probe-866-datemove.py: 314 карточки окна, 107 совпали по названию с лентой, 6 расхождений даты).
//
// 08fdfad2 «The Mr and Mrs Bubble Show» 14.11 16:00 → end_date 15.11, end_time 11:00
//   арбитр — лента CN (прямые запросы, срезы городов через прокси):
//     cn-nicosia: the-mr-and-mrs-bubble-show-interactive-bubble-theatre-for-kids-in-nicosia-2026-11-14
//                 start_at 2026-11-14T14:00Z (=16:00 местного) → end_at 2026-11-15T09:00Z
//                 venue «Mascarini Theatre», city Nicosia
//     cn-larnaca: the-mr-and-mrs-bubble-show-στη-λάρνακα-2026-11-15
//                 start_at 2026-11-15T09:00Z (=11:00 местного), venue «Δημοτικό Θέατρο Γ. Λυκούργος»
//   ⇒ это ДВЕ независимые записи двух городов, а `end_at` никосийской = окно гастроли
//     (совпадает с началом ларнакского показа). Ларнака уже стоит своей живой карточкой
//     1138c52e «Г-н и г-жа Bubble» 15.11 11:00 ⇒ потерь от сужения нет.
//   ⇒ end_date = 2026-11-14, end_time = null (спектакль один, начинается 16:00).
//
// Использование:  node dots/events/bubble-866-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/bubble-866-apply.mjs   (запись)
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
    id: '08fdfad2-6706-4ce8-91b8-4eb0b117fa0a',
    title: 'bubble',
    start: '2026-11-14',
    fromCity: 'Никосия, Кипр',
    fromEnd: '2026-11-15',
    fromEndTime: '11:00:00',
    next: { end_date: '2026-11-14', end_time: null },
    why: 'CN: Никосия 14.11 14:00Z (Mascarini Theatre) и Ларнака 15.11 09:00Z — две записи; end_at никосийской 15.11 09:00Z = окно гастроли, Ларнака держится карточкой 1138c52e ⇒ сузить до 14.11, end_time null',
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
  if (!(row.title || '').toLowerCase().includes(it.title)) {
    console.log(`- ${p} заголовок «${row.title}» не совпал — пропуск`); skipped++; continue;
  }
  if (row.start_date !== it.start || row.city !== it.fromCity) {
    console.log(`- ${p} дата/город уже другие (${row.start_date} / ${row.city}) — пропуск`); skipped++; continue;
  }
  if (row.end_date !== it.fromEnd) {
    console.log(`- ${p} end_date уже ${row.end_date} — пропуск`); skipped++; continue;
  }
  if (String(row.end_time || '') !== it.fromEndTime) {
    console.log(`- ${p} end_time уже ${row.end_time} — пропуск`); skipped++; continue;
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
