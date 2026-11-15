#!/usr/bin/env node
// Запуск 901: КОД ВАЛЮТЫ в двух регистрах — «IDR»/«USD»/«VND» рядом с «idr»/«vnd»/«eur».
//
// Класс найден офлайн-переписью прод-снапшота 15.11.2026 (`probe901`): из 109 карточек
// с валютой 15 несли ВЕРХНИЙ регистр (IDR 8, VND 6, USD 1), остальные — нижний.
// Источник расхождения — разные сборщики: театр-заглушки и TG-групповые афиши писали
// 'IDR'/'USD'/'VND' литералами, Балифорум/Cyprus Now/Cyprus.BZ — в нижнем регистре.
//
// Почему это дефект, а не косметика: фильтр на сайте сравнивает код СТРОГО
// (`src/lib/eventFilters.ts`: ev.currency !== filters.currency), а список валют в фильтре
// берётся из i18n в нижнем регистре ⇒ карточки с 'IDR' НЕ находились фильтром
// «Индонезийская рупия» (8 реальных событий Бали с ценой выпадали из выдачи).
// Корень закрыт в коде: `scripts/currency.mjs` (`cleanCurrency`) подключён во всех
// пяти сборщиках, которые пишут `currency`, и сравнение в фильтре сделано без регистра.
//
// Эта миграция приводит к тому же виду уже собранные строки. Ключ дедупа
// (`city|title+address`) валюту не использует ⇒ повторный сбор дублей не даст.
//
// Использование:  node dots/events/currency-901-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/currency-901-apply.mjs   (запись)
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
  { id: '3ef4300d-9838-466e-9c2b-a321bab1fff7', title: "Kecak и танцы в Padang Tegal Kaja", city: "Убуд, Bali", start: '2026-09-08', oldCur: 'IDR' },
  { id: '905bb225-bc9c-46ea-9c5c-12da83fc1a11', title: "Танцевальные представления в Bale Banjar Ubud Kelod", city: "Убуд, Bali", start: '2026-09-08', oldCur: 'IDR' },
  { id: '9b2c6af3-a740-4687-98b9-cda177f4dd93', title: "Танцевальные представления в храме Пура Далем", city: "Убуд, Bali", start: '2026-09-08', oldCur: 'IDR' },
  { id: 'a92f4b68-854e-4345-b3af-4cc5855a8012', title: "Kecak Fire Dance в храме Улувату", city: "Печату (Улувату), Bali", start: '2026-09-08', oldCur: 'IDR' },
  { id: 'af63e539-e913-4ca3-a010-e7d3117a1975', title: "Танцевальные представления в храме Сарасвати", city: "Убуд, Bali", start: '2026-09-08', oldCur: 'IDR' },
  { id: 'e80e6f75-3afd-4173-828c-a05191a6708c', title: "Танцевальные представления в Ubud Palace", city: "Убуд, Bali", start: '2026-09-08', oldCur: 'IDR' },
  { id: '5cedeb4c-b109-4848-bedd-160690d80c27', title: "ARMA Dance Performance", city: "Убуд, Bali", start: '2026-09-12', oldCur: 'IDR' },
  { id: '6c5c4069-91e3-4404-baa9-44dd18870d67', title: "Kecak Dance & The Art of Royal Balinese Dinner", city: "Убуд, Bali", start: '2026-09-22', oldCur: 'IDR' },
  { id: 'd87e2814-7362-4047-8ae6-0566ebe06320', title: "Life Puppets — кукольное шоу в Đó Theatre", city: "Нячанг", start: '2026-09-08', oldCur: 'USD' },
  { id: '513d9371-e071-4d9b-8489-42d2af1e2ee9', title: "Шоу Ao Dai в Дананге", city: "Дананг", start: '2026-08-30', oldCur: 'VND' },
  { id: 'fdf56fce-c81d-4a79-bee3-c8664127c1b0', title: "Шоу Charming Danang в Дананге", city: "Дананг", start: '2026-08-30', oldCur: 'VND' },
  { id: '89a8599f-c26e-4e99-b407-f69f8ffed2ce', title: "Dolphinarium Show", city: "Дананг", start: '2026-09-22', oldCur: 'VND' },
  { id: 'c941dccf-647c-48eb-94e0-5ce387bda82b', title: "À Ố Show", city: "Дананг", start: '2026-09-22', oldCur: 'VND' },
  { id: 'd6741792-8f37-4b3e-8b7c-77523017e29b', title: "Hồn Việt Show", city: "Дананг", start: '2026-09-22', oldCur: 'VND' },
  { id: '2ccf2a96-d846-45e3-9794-4be937e4a4a1', title: "Hội An Memories Show", city: "Дананг", start: '2026-09-23', oldCur: 'VND' },
];

const SEL = 'id,title,status,city,start_date,currency';
async function get(id) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&select=${SEL}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())[0] || null;
}

let done = 0, skipped = 0, failed = 0;
console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}; правок ${ITEMS.length}`);

for (const it of ITEMS) {
  const p = it.id.slice(0, 8);
  const next = it.oldCur.toLowerCase();
  try {
    const row = await get(it.id);
    if (!row) { console.log(`- ${p} не найдена — пропуск`); skipped++; continue; }
    if (row.status !== 'active') { console.log(`- ${p} status=${row.status} — пропуск`); skipped++; continue; }
    if (row.currency === next) { console.log(`- ${p} уже ${next} — пропуск`); skipped++; continue; }
    if (row.currency !== it.oldCur) {
      console.log(`- ${p} валюта уже другая (${row.currency}) — пропуск`); skipped++; continue;
    }
    console.log(`правка: ${p} «${row.title}» ${row.city} ${row.start_date}: currency ${it.oldCur} ⇒ ${next}`);
    if (!APPLY) { done++; continue; }

    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active&currency=eq.${it.oldCur}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ currency: next }),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const back = (await r.json())[0];
    if (!back) throw new Error('PATCH вернул пусто (страховки status/currency не совпали)');
    const ok = back.currency === next;
    console.log(`${ok ? 'ок' : 'РАСХОЖДЕНИЕ'} readback: ${back.id.slice(0, 8)} currency=${back.currency}`);
    if (ok) done++; else failed++;
  } catch (e) { console.log(`! ${p} ${e.message}`); failed++; }
}

console.log(`итог: ${APPLY ? 'применено' : 'к правке'} ${done}, пропущено ${skipped}, ошибок ${failed}`);
