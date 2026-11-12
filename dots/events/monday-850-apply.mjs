#!/usr/bin/env node
// Запуск 850: «A Monday to Die For» (Wherehaus 612, Никосия) — карточки печатают
// интервал до 14.12, тогда как источник держит ОКНО СЕРИИ, а занятий всего два: 09.12 и 12.12.
// Зонд: %LOCALAPPDATA%\Temp\probe-850.py, probe-850b.py по прод-снапшоту (gen 08.11 21:23Z, 1307 карточек).
// Арбитр: лента Cyprus Now напрямую с RU-IP (прокси не нужен):
//   ?q=die for → ДВЕ записи, у ОБЕИХ series_count 2, series_first 2026-12-09T18:00Z,
//                series_last 2026-12-12T18:00Z, end_at 2026-12-14T18:00Z (=20:00 местного),
//                venue Wherehaus 612 ⇒ 14.12 — конец ОКНА серии, а не дата показа.
//   ?q=wherehaus → те же две записи (других событий у площадки в ленте нет).
// Правило навыка «тур/серия: end_at ленты — окно, сводить end_date к start_date».
//   · a262e452 «A Monday to Die For: English Comedy in Nicosia» 09.12→14.12 — СУЗИТЬ до 09.12;
//   · 2771bf56 «A Monday to Die For» 12.12→14.12 — СУЗИТЬ до 12.12.
// Архив не годится: даты 09.12 и 12.12 разные, каждая — свой вечер, отдельных карточек на них нет.
// Использование:  node dots/events/monday-850-apply.mjs            (dry-run)
//                 APPLY=1 node dots/events/monday-850-apply.mjs     (запись)
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
    id: 'a262e452-c58a-427d-897d-4a062d9ee0b3',
    title: 'A Monday to Die For: English Comedy in Nicosia',
    start: '2026-12-09', end: '2026-12-14',
    mode: 'shrink', nextEnd: '2026-12-09',
    why: 'CN ?q=die for: series_count 2, series_first 09.12, series_last 12.12, end_at 14.12 = окно серии ⇒ вечер один, 09.12 20:00',
  },
  {
    id: '2771bf56-72a8-4eb9-986c-0f97a76a257e',
    title: 'A Monday to Die For',
    start: '2026-12-12', end: '2026-12-14',
    mode: 'shrink', nextEnd: '2026-12-12',
    why: 'та же серия, вторая запись ленты: series_last 12.12, end_at 14.12 — окно ⇒ вечер 12.12 20:00',
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

  const body = { end_date: it.nextEnd };
  console.log(`сужение: ${p} «${row.title}» ${row.start_date}→${row.end_date} ⇒ ${JSON.stringify(body)}`);
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
    const ok = back.end_date === it.nextEnd && back.start_date === it.start;
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} ${back.start_date}→${back.end_date} ${back.start_time}→${back.end_time}`);
    ok ? done++ : failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${APPLY ? done : ITEMS.length - skipped - failed}, пропущено ${skipped}, ошибок ${failed}`);
