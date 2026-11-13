#!/usr/bin/env node
// Запуск 858: третий показ тура «Спартак» — пин на городском фолбэке при известной площадке.
//
// Фронт: лид 857 «4e8fb28c Балет Спартак в Лимасоле 30.11 19:30 — в ленте CN такой даты нет,
// проверить, откуда взялась». Проверено — дата РЕАЛЬНАЯ:
//   • лента Cyprus Now (через прокси 10809, ?q=ballet&limit=25) держит отдельную запись
//     `балет-спартак-в-лимасоле-2026-11-30`, start_at 2026-11-30T17:30:00Z = 19:30 местного
//     (UTC+2), venue null, city null — отсюда и городской фолбэк в карточке;
//   • арбитр — билетная афиша продавца (tickets.atriamusic.com): у тура ТРИ показа,
//     27.11 19:30 Nicosia Municipal Theatre (eid/413), 28.11 20:00 Pattihio (eid/414),
//     30.11 19:30 Pattihio Theatre, Limassol, 4 Agias Zonis (eid/414, «spartacus-ballet-30-nov-2026»).
//   ⇒ карточка законна, архивировать/сужать нечего.
//
// Остаётся качество пина: карточка стоит на точке-фолбэке CN (34.6852901,33.0332657),
// адрес — «Лимасол, Кипр» (город), а площадка известна и её точка уже есть у ЖИВОЙ карточки
// того же зала: c2c6244e «Spartacus Ballet» 28.11 20:00 Pattihio Municipal Theatre
// 34.6813906,33.0440049 (координаты площадки из ленты CN, 7 знаков).
// Сдвиг ~1.16 км. Адрес НЕ трогаем (он входит в ключ дедупа city|title+address).
//
// Использование:  node dots/events/spartacus30-pin-858-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/spartacus30-pin-858-apply.mjs   (запись)
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
    id: '4e8fb28c-6f11-49c9-83e5-ca683ce0e769',
    title: 'Спартак',
    start: '2026-11-30',
    city: 'Лимасол, Кипр',
    fromLat: 34.6852901, fromLng: 33.0332657,
    toLat: 34.6813906, toLng: 33.0440049,
    why: 'atria 30.11 19:30 Pattihio Theatre, 4 Agias Zonis; точка зала = пин живой карточки c2c6244e (CN venue 7 знаков)',
  },
];

const SEL = 'id,title,status,start_date,start_time,city,address,lat,lng';
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
  if (row.start_date !== it.start || row.city !== it.city) {
    console.log(`- ${p} дата/город уже другие (${row.start_date} / ${row.city}) — пропуск`); skipped++; continue;
  }
  if (Math.abs(Number(row.lat) - it.fromLat) > 1e-6 || Math.abs(Number(row.lng) - it.fromLng) > 1e-6) {
    console.log(`- ${p} пин уже другой (${row.lat},${row.lng}) — пропуск`); skipped++; continue;
  }

  const dKm = Math.round(Math.hypot((it.toLat - it.fromLat) * 111, (it.toLng - it.fromLng) * 111 * Math.cos(it.fromLat * Math.PI / 180)) * 100) / 100;
  console.log(`правка: ${p} «${row.title}» ${row.start_date} ${row.start_time}: пин ${it.fromLat},${it.fromLng} ⇒ ${it.toLat},${it.toLng} (${dKm} км)`);
  console.log(`        арбитр: ${it.why}`);
  if (!APPLY) continue;

  try {
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active&start_date=eq.${it.start}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ lat: it.toLat, lng: it.toLng }),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const back = (await r.json())[0];
    if (!back) throw new Error('PATCH вернул пусто (страховка status/start_date не совпала)');
    const ok = Math.abs(Number(back.lat) - it.toLat) < 1e-6 && Math.abs(Number(back.lng) - it.toLng) < 1e-6;
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} пин ${back.lat},${back.lng} city=${back.city}`);
    ok ? done++ : failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done || ITEMS.length - skipped - failed}, пропущено ${skipped}, ошибок ${failed}`);
