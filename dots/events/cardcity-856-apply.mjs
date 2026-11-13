#!/usr/bin/env node
// Запуск 856: карточка стоит в ЧУЖОМ городе, хотя её же заголовок называет верный.
// Класс найден офлайн по прод-снапшоту (gen 08.11 21:23Z, 1307 карточек): у карточки
// название/описание называет город X, а поля city/address/пин — город Y.
//
// 3abb78c3 «Tiramisu Bake-Off в Лимассоле» (28.11 15:00)
//   было: city «Никосия, Кипр», address «Etxetera, Никосия», пин 35.1666728,33.3486745
//   арбитр — лента Cyprus Now, прямой запрос с RU-IP (прокси не нужен):
//     GET https://cyprusnow.app/api/events?q=tiramisu&limit=5
//     -> slug tiramisu-bake-off-in-limassol-2026-11-28, start_at 2026-11-28T13:00:00Z
//        (=15:00 местного, совпадает с карточкой 1:1),
//        venue.name «Etxetera», venue.city «Limassol», venue.lat/lng 34.6786322,33.0413055
//   независимый второй голос — Nominatim reverse 34.6786322,33.0413055
//     = «Navarinou, Αγία Ζώνη, Λεμεσός, Епархия Лемесу» ⇒ точка в Лимасоле, не в Никосии.
//   ⇒ событие идёт в Лимасоле; правим city, address и пин (Никосия — ошибка сборщика).
//
// Использование:  node dots/events/cardcity-856-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/cardcity-856-apply.mjs   (запись)
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
    id: '3abb78c3-9f76-4228-8a1d-e0fed12ac60f',
    title: 'Tiramisu Bake-Off',
    start: '2026-11-28',
    fromCity: 'Никосия, Кипр',
    fromAddr: 'Etxetera',
    fromLat: 35.1666728, fromLng: 33.3486745,
    next: { city: 'Лимасол, Кипр', address: 'Etxetera, Лимасол', lat: 34.6786322, lng: 33.0413055 },
    why: 'CN ?q=tiramisu: одна запись, venue Etxetera, city Limassol, 34.6786322,33.0413055, 13:00Z=15:00 = время карточки; Nominatim reverse точки = Navarinou, Αγία Ζώνη, Λεμεσός ⇒ Лимасол, а не Никосия',
  },
];

const SEL = 'id,title,status,start_date,city,address,lat,lng';
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
  if (row.city !== it.fromCity || !String(row.address || '').startsWith(it.fromAddr)) {
    console.log(`- ${p} уже другой город/адрес (${row.city} / ${row.address}) — пропуск`); skipped++; continue;
  }
  if (Math.abs((row.lat ?? 0) - it.fromLat) > 1e-4 || Math.abs((row.lng ?? 0) - it.fromLng) > 1e-4) {
    console.log(`- ${p} пин уже сдвинут (${row.lat},${row.lng}) — пропуск`); skipped++; continue;
  }

  console.log(`правка: ${p} «${row.title}» ${row.start_date}: ${row.city} ⇒ ${it.next.city}, пин ${row.lat},${row.lng} ⇒ ${it.next.lat},${it.next.lng}`);
  if (!APPLY) continue;

  try {
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(it.next),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const back = (await r.json())[0];
    if (!back) throw new Error('PATCH вернул пусто (страховка status=eq.active не совпала)');
    const ok = back.city === it.next.city && back.address === it.next.address
      && Math.abs(back.lat - it.next.lat) < 1e-6 && Math.abs(back.lng - it.next.lng) < 1e-6;
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} ${back.city} ${back.lat},${back.lng}`);
    ok ? done++ : failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done || ITEMS.length - skipped - failed}, пропущено ${skipped}, ошибок ${failed}`);
