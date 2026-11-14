#!/usr/bin/env node
// Запуск 826/827: правка пинов, подтверждённых арбитром (пока БД в блоке квоты — только DRY).
// Источник лидов: dots/events/leads-city-pin-826.json (зонд «метка города ↔ округ точки» по снапшоту 1307 карточек).
//
// ВЕРДИКТЫ ЗАПУСКА 827 (арбитры приложены к каждой записи):
//  - 6de2cf8b / 4c19ed1e «Παρασκευή σουτζιούκου» — НЕ дефект: точка 34.8798,33.1909 =
//    Agioi Vavatsinias, Nominatim (cy) → «… Επαρχία Λάρνακας» (округ Ларнаки) ⇒ метка «Ларнака» верна,
//    ложным был бокс зонда. Закрыто, не править.
//  - 3ac030b9 «Raw Party in Limassol» — НЕ дефект: точка 34.7711087,33.2430851 = Sayious Adventure Park,
//    Nominatim (cy) → Asgata, «Επαρχία Λεμεσού», координаты OSM 34.7710703,33.2437454 (60 м) ⇒
//    округ Лимасола, метка верна. Пин совпадает с venue ленты CN 1:1 (источник сам так ставит). Закрыто.
//  - 81e17f9b «Kyklaminon Street Food Festival» — ДЕФЕКТ: карточка стоит на деревне Мони (геокодер по адресу
//    «Kyklaminon, Мони»), лента CN отдаёт площадку venue «Kyklaminon», Limassol 34.7010965,33.0087179,
//    и OSM по этой точке отвечает POI «Kyklaminon, Agia Fylaxis, Λεμεσός 3110» ⇒ пин площадки, не центроид.
//    Сдвиг 18.5 км. Правится здесь.
//
// Использование:  node --env-file=C:/Users/armag/projects/events-map/.env pins-826-apply.mjs        (DRY)
//                 APPLY=1 node --env-file=... pins-826-apply.mjs                                   (запись)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';

// id — полный uuid; from — ожидаемая точка (страховка «карточка всё ещё на старом пине»)
const FIXES = [
  { id: '81e17f9b-0094-4885-ab98-afa65bc4625f', title: 'Kyklaminon Street Food Festival',
    from: { lat: 34.7259609, lng: 33.2046984 }, to: { lat: 34.7010965, lng: 33.0087179 },
    why: 'CN venue «Kyklaminon» Limassol 34.7010965,33.0087179 + OSM POI «Kyklaminon, Agia Fylaxis, Λεμεσός 3110»; адрес карточки называет Kyklaminon, пин стоял на деревне Мони (18.5 км)' },
  // --- запуск 831: лид 799 «Лисевский — арбитра нет» закрыт живой карточкой того же концерта ---
  { id: '64d85263-2550-4aea-8315-b715698f51d0', title: 'Богдан Лисевский на Кипре',
    from: { lat: 34.6852901, lng: 33.0332657 }, to: { lat: 34.691259, lng: 32.955455 },
    why: 'зал называет живая карточка того же концерта 16b568c5 «BOGDAN LISEVSKY | Limassol» с адресом «Ypsonas Municipal Theatre» и пином 34.691259,32.955455; у этой карточки адрес ровно «Лимасол, Кипр» и пин = фолбэк-точка геокодера CN 34.6852901,33.0332657 (сдвиг 7.1 км). Время расходится (18:30 / 19:00), поэтому это правка пина, а не дубль' },
];

const dist = (a, b) => {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

(async () => {
  console.log(`режим: ${APPLY ? 'APPLY (запись)' : 'DRY-RUN'}; правок ${FIXES.length}`);
  for (const f of FIXES) console.log(`  ${f.id.slice(0, 8)} ${f.title}: ${f.from.lat},${f.from.lng} → ${f.to.lat},${f.to.lng} (${dist(f.from, f.to).toFixed(1)} км)`);
  if (!APPLY) {
    console.log('DRY-RUN: в базу не ходил (при блоке квоты REST отдаёт 402). Запускать APPLY=1 после разблокировки.');
    return;
  }
  if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении'); process.exit(2); }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  let ok = 0, skipped = 0, failed = 0;
  for (const f of FIXES) {
    const g = await fetch(`${URL_}/rest/v1/events?id=eq.${f.id}&select=id,title,status,lat,lng,city,start_date,start_time`, { headers: H });
    if (!g.ok) { console.error(`GET ${g.status} ${f.id.slice(0, 8)}: ${(await g.text()).slice(0, 160)}`); failed++; continue; }
    const row = (await g.json())[0];
    if (!row || row.status !== 'active') { console.log(`skip ${f.id.slice(0, 8)}: нет строки/не active`); skipped++; continue; }
    if (Math.abs(row.lat - f.from.lat) > 1e-6 || Math.abs(row.lng - f.from.lng) > 1e-6) {
      console.log(`skip ${f.id.slice(0, 8)}: пин уже другой (${row.lat},${row.lng})`); skipped++; continue;
    }
    const p = await fetch(`${URL_}/rest/v1/events?id=eq.${f.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ lat: f.to.lat, lng: f.to.lng }),
    });
    if (!p.ok) { console.error(`PATCH ${p.status} ${f.id.slice(0, 8)}: ${(await p.text()).slice(0, 160)}`); failed++; continue; }
    const back = (await p.json())[0];
    if (back && Math.abs(back.lat - f.to.lat) < 1e-6 && Math.abs(back.lng - f.to.lng) < 1e-6) {
      console.log(`ok ${f.id.slice(0, 8)} ${back.title}: ${back.lat},${back.lng} city=${back.city} ${back.start_date} ${back.start_time}`); ok++;
    } else { console.error(`readback не совпал ${f.id.slice(0, 8)}`); failed++; }
  }
  console.log(`итог: ok ${ok}, пропущено ${skipped}, ошибок ${failed}`);
  if (failed) process.exit(1);
})();
