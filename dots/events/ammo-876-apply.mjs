#!/usr/bin/env node
// Запуск 876: пин карточки в 5.85 км от её же площадки (лид 873, группа «Ammochostos Cultural Center»).
// Снапшот прода (gen 08.11 21:23Z, 1307 карточек): у двух живых карточек один address
// «Ammochostos Cultural Center, Famagusta», но РАЗНЫЕ точки:
//   fdee56e8 17.11 19:30 — 35.0694388,33.958601
//   5864fd11 24.11 19:00 — 35.1205,33.9432
// Арбитр — Nominatim reverse (zoom 18):
//   35.0694388,33.958601 → «Famagusta Cultural Centre, Evagora, Δερύνεια, Επαρχία Αμμοχώστου»
//      = сама площадка (Ammochostos Cultural Centre стоит в Деринии, муниципалитет Фамагусты в изгнании)
//   35.1205,33.9432 → «Fevzi Çakmak Bulvarı, Namık Kemal, Gazimağusa» — улица города, не площадка
// ⇒ правим ТОЛЬКО пин 5864fd11 на точку площадки. city/address не трогаем (address — ключ дедупа).
// Использование:  node dots/events/ammo-876-apply.mjs
//                 APPLY=1 node dots/events/ammo-876-apply.mjs
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE'); process.exit(2); }

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const ITEMS = [{
  id: '5864fd11-0000-0000-0000-000000000000', // заполняется ниже по префиксу через start_date
  prefix: '5864fd11',
  date: '2026-11-24',
  titleLike: 'prevention',
  from: { lat: 35.1205, lng: 33.9432 },
  next: { lat: 35.0694388, lng: 33.958601 },
  why: 'Nominatim reverse новой точки = Famagusta Cultural Centre, Evagora, Δερύνεια (округ Фамагуста); старая = улица Fevzi Çakmak, Gazimağusa',
}];

const near = (a, b, eps) => Math.abs(a - b) <= eps;

async function run() {
  console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${ITEMS.length}`);
  let done = 0, skipped = 0, failed = 0;
  for (const it of ITEMS) {
    const q = `${URL_}/rest/v1/events?status=eq.active&start_date=eq.${it.date}` +
      '&select=id,title,address,city,lat,lng,start_date,start_time';
    const r = await fetch(q, { headers: H });
    if (!r.ok) { console.error(`[${it.prefix}] GET ${r.status} ${(await r.text()).slice(0, 120)}`); failed++; continue; }
    const rows = await r.json();
    const row = rows.find(x => String(x.id).startsWith(it.prefix));
    if (!row) { console.log(`[${it.prefix}] SKIP: карточка не найдена`); skipped++; continue; }
    if (!(row.title || '').toLowerCase().includes(it.titleLike)) { console.log(`[${it.prefix}] SKIP: title «${row.title}»`); skipped++; continue; }
    if (!(row.address || '').toLowerCase().includes('ammochostos')) { console.log(`[${it.prefix}] SKIP: адрес «${row.address}»`); skipped++; continue; }
    if (!near(row.lat, it.from.lat, 5e-4) || !near(row.lng, it.from.lng, 5e-4)) {
      console.log(`[${it.prefix}] SKIP: пин уже ${row.lat},${row.lng}`); skipped++; continue;
    }
    console.log(`[${it.prefix}] ${row.start_date} ${row.start_time} «${row.title}»`);
    console.log(`   пин ${row.lat},${row.lng} -> ${it.next.lat},${it.next.lng}`);
    console.log(`   арбитр: ${it.why}`);
    if (!APPLY) continue;
    const p = await fetch(`${URL_}/rest/v1/events?id=eq.${row.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ lat: it.next.lat, lng: it.next.lng }),
    });
    if (!p.ok) { console.error(`[${it.prefix}] PATCH ${p.status} ${(await p.text()).slice(0, 160)}`); failed++; continue; }
    const back = (await p.json())[0];
    if (back && near(back.lat, it.next.lat, 1e-6) && near(back.lng, it.next.lng, 1e-6)) {
      console.log(`[${it.prefix}] readback OK: ${back.lat},${back.lng}`); done++;
    } else { console.log(`[${it.prefix}] readback НЕ совпал`); failed++; }
  }
  console.log(`итог: применено ${done}, пропущено ${skipped}, ошибок ${failed}`);
  if (failed) process.exit(1);
}
run().catch(e => { console.error('ошибка', e.message); process.exit(1); });
