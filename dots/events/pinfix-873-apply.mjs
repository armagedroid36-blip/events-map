#!/usr/bin/env node
// Запуск 873: пин карточки стоит не там, где её же площадка у соседней живой карточки / у источника.
// Класс найден офлайн по прод-снапшоту (gen 08.11 21:23Z, 1307 карточек) зондом
// probe-873-addrpin.py: группы по нормализованному address, у которых точки расходятся > 1.5 км.
// Из 643 групп таких 7; 2 подтверждены вторым голосом:
//
// 1) 99a661e4 «Velvet Void Oblivion Protocol at Ktima Camelot» 31.12 21:00
//    было: city «Лимасол, Кипр», address «Ktima Camelot», пин 34.6954473,33.0349311 (центр Лимасола)
//    арбитр — лента Cyprus Now (прямой запрос с RU-IP): ?q=velvet%20void отдаёт ДВЕ записи
//      на 31.12 — «…at Ktima Camelot» venue Ktima Camelot с ТОЧКОЙ 34.6954473,33.0349311 (Лимасол)
//      и вторая «…at Ktima Camelot» venue Ktima Camelot 35.0793206,33.193694 (Никосия).
//    Второй голос — живая карточка той же площадки 6def3647 «Alchemy Festival – Teaser Party»
//      14.11, address «Ktima Camelot», пин 35.07932,33.19369.
//    ⇒ у площадки два слага в ленте, лимасольский пин — центр города (ошибка агрегатора);
//      Ktima Camelot — имение под Никосией. Правим city + пин. Адрес не трогаем (ключ дедупа).
//
// 2) e126e623 «Emma Smith: Live Jazz in Nicosia» 12.02.2027 20:30
//    было: пин 35.1855659,33.3822764 — ровно ЦЕНТРОИД Никосии (не площадка), address «Ella Jazz Bar»
//    арбитр — живая карточка того же зала e7ef618e «Windcraft Back…» 29.11, address «Ella Jazz Bar»,
//      пин 35.172426,33.3616567; запись ленты CN ?q=emma%20smith даёт venue «Ella Jazz Bar»,
//      но координаты у неё те же центроидные ⇒ пин брать у соседа по залу, а не у ленты.
//    Правим только пин, city/address не меняем.
//
// Использование:  node dots/events/pinfix-873-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/pinfix-873-apply.mjs   (запись)
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
  // Запуск 891: цель 99a661e4 СНЯТА — это `copy` пары dupes-822 (canon 2e1b6134 стоит на реальной площадке
  // Ktima Camelot 35.0793206,33.193694, а копия — на лимасольском центроиде). Шаг 1 цепочки архивирует
  // копию, поэтому правка city/пина применялась бы в пустоту; верное состояние даёт архивация.
  {
    id: 'e126e623-6d67-4218-a340-b1f703ad411a',
    title: 'Emma Smith',
    fromCity: 'Никосия, Кипр',
    fromLat: 35.1855659, fromLng: 33.3822764,
    next: { lat: 35.172426, lng: 33.3616567 },
    why: 'пин = центроид Никосии; зал Ella Jazz Bar у живой карточки e7ef618e стоит на 35.172426,33.3616567',
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
  if (row.city !== it.fromCity) { console.log(`- ${p} город уже другой (${row.city}) — пропуск`); skipped++; continue; }
  if (Math.abs((row.lat ?? 0) - it.fromLat) > 1e-4 || Math.abs((row.lng ?? 0) - it.fromLng) > 1e-4) {
    console.log(`- ${p} пин уже сдвинут (${row.lat},${row.lng}) — пропуск`); skipped++; continue;
  }

  console.log(`правка: ${p} «${row.title}» ${row.start_date}: ${row.city} ${row.lat},${row.lng} ⇒ ${it.next.city || row.city} ${it.next.lat},${it.next.lng}`);
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
    const ok = Math.abs(back.lat - it.next.lat) < 1e-6 && Math.abs(back.lng - it.next.lng) < 1e-6
      && (!it.next.city || back.city === it.next.city);
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} status=${back.status} ${back.city} ${back.lat},${back.lng}`);
    ok ? done++ : failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done || ITEMS.length - skipped - failed}, пропущено ${skipped}, ошибок ${failed}`);
