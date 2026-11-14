#!/usr/bin/env node
// Запуск 884: миграция класса «адрес-заглушка `Cyprus, Cyprus`» (9 живых карточек).
// Корень в сборщике закрыт в 883: cardAddress() в collect-cyprus.mjs выбрасывает страну/Unknown/повторы,
// поэтому для этих записей сборщик теперь положит адрес = канон города (фолбэк).
// Миграция приводит уже собранные строки к ТОМУ ЖЕ значению, иначе ключ дедупа `city|title+address`
// оставит заглушку навсегда и на следующем сборе родит дубль рядом с чистой карточкой.
// Новое значение НЕ выдумывается: только `city` карточки (канон вида «Никосия, Кипр»); площадку
// из заголовка («Менико», «Statos», «Строволос») в адрес не тащим — это не адрес.
// Использование:  node cy-addr-884-apply.mjs            (dry-run)
//                 APPLY=1 node cy-addr-884-apply.mjs     (запись)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении'); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// id — из прод-снапшота 1307 карточек (gen 08.11 21:23Z); expectCity — гейт: город карточки не менялся
const IDS = [
  { id: 'b3f73c3a', expectCity: 'Никосия' },
  { id: '11d8870e', expectCity: 'Никосия' },
  { id: '6f87b3be', expectCity: 'Ларнака' },
  { id: 'd91b3d72', expectCity: 'Лимасол' },
  // Запуск 891: 31e0df3f СНЯТА из целей — это `copy` пары dupes-822 (canon f2eb1c6c, Christmas Village
  // Statos: у канона адрес называет площадь деревни, у копии заглушка «Cyprus, Cyprus»). Шаг 1 цепочки
  // архивирует копию ⇒ гейт «живая карточка» пропустил бы правку, а счётчик «правок» врал бы на 1.
  { id: '99143754', expectCity: 'Никосия' },
  { id: 'aed3b1df', expectCity: 'Никосия' },
  // Запуск 891: d49ed492 СНЯТА по той же причине — `copy` пары dupes-822 (canon 5ef76609, Island People
  // Excellence Award; лента CN даёт ОДНУ запись, город-заглушка у обеих). Архивируется шагом 1.
  { id: '89e345be', expectCity: 'Никосия' },
  // Запуск 885: те же 8 карточек, чей адрес санитайзер 883/885 теперь нормализует иначе, чем он лежит
  // в базе. Значение `to` снято ЖИВОЙ cardAddress (probe-885-addr.mjs), не придумано: у улицы/площадки
  // страна снимается, повторы схлопываются. Без этой миграции ключ дедупа `city|title+address`
  // разошёлся бы с базой и следующий сбор родил бы дубль.
  { id: '0863b0c6', expectCity: 'Лимасол', expect: 'Axiou, Agia Fylaxis, Лимасол, Кипр', to: 'Axiou, Agia Fylaxis, Лимасол' },
  { id: '123cf6a2', expectCity: 'Лимасол', expect: 'Axiou, Agia Fylaxis, Лимасол, Кипр', to: 'Axiou, Agia Fylaxis, Лимасол' },
  { id: '0fc79fd4', expectCity: 'Лимасол', expect: 'Axiou, Agia Fylaxis, Лимасол, Кипр', to: 'Axiou, Agia Fylaxis, Лимасол' },
  { id: 'a61bb6a8', expectCity: 'Лимасол', expect: 'Лимассол, Лимассол', to: 'Лимассол' },
  { id: '94b7f23c', expectCity: 'Лимасол', expect: 'Лимассол, Лимассол', to: 'Лимассол' },
  { id: '1e3a9b12', expectCity: 'Никосия', expect: 'Ресторан Loft, Никосия, Никосия', to: 'Ресторан Loft, Никосия' },
  { id: 'a1afd70f', expectCity: 'Пафос', expect: 'Мультикультурное пространство Attikon, Пафос, Пафос', to: 'Мультикультурное пространство Attikon, Пафос' },
  { id: 'd26c7381', expectCity: 'Никосия', expect: 'Village square, Pedoulas, Cyprus', to: 'Village square, Pedoulas' },
  // Запуск 890: 18-я цель — пустой address в базе, а сборщик (buildRow, 887/889) положит фолбэк-канон города.
  // Гейт expectNull: правим ТОЛЬКО пока адрес реально пуст; значение = city карточки (как у остальных целей).
  { id: '978dbee2', expectCity: 'Никосия', expectNull: true },
];

const isStub = (a) => {
  const parts = String(a || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return parts.length > 0 && parts.every(p => ['cyprus', 'кипр', 'κύπρος', 'kypros', 'unknown', 'n/a', '-', '—'].includes(p));
};

async function get(id) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&status=eq.active&select=id,city,address,title,start_date`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status} ${(await r.text()).slice(0, 120)}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function patch(id, body) {
  const r = await fetch(`${URL_}/rest/v1/events?id=eq.${id}&status=eq.active`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${r.status} ${(await r.text()).slice(0, 120)}`);
  const rows = await r.json();
  return rows[0] || null;
}

(async () => {
  console.log(`режим: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  let plan = 0, skip = 0;
  for (const it of IDS) {
    let ev;
    try { ev = await get(it.id); } catch (e) { console.log(`СТОП: ${it.id} ${e.message}`); process.exit(3); }
    if (!ev) { console.log(`SKIP ${it.id}: нет живой карточки`); skip++; continue; }
    if (!String(ev.city || '').startsWith(it.expectCity)) { console.log(`SKIP ${it.id}: city «${ev.city}» ≠ ${it.expectCity}`); skip++; continue; }
    let next;
    if (it.to) {                                // цель из 885: адрес нормализуется санитайзером, гейт — старый адрес
      if (String(ev.address || '').trim() !== it.expect) { console.log(`SKIP ${it.id}: адрес «${ev.address}» ≠ «${it.expect}»`); skip++; continue; }
      next = it.to;
    } else if (it.expectNull) {                 // цель 890: адрес в базе пуст, сборщик положит канон города
      if (ev.address != null && String(ev.address).trim() !== '') { console.log(`SKIP ${it.id}: адрес уже «${ev.address}»`); skip++; continue; }
      next = ev.city;
    } else {
      if (!isStub(ev.address)) { console.log(`SKIP ${it.id}: адрес уже «${ev.address}»`); skip++; continue; }
      next = ev.city;                           // ровно то, что положит сборщик (фолбэк = канон города)
    }
    if (!next || isStub(next)) { console.log(`SKIP ${it.id}: city как адрес не годится («${next}»)`); skip++; continue; }
    plan++;
    console.log(`  ${it.id} «${(ev.title || '').slice(0, 44)}» ${ev.start_date}: «${ev.address}» → «${next}»`);
    if (!APPLY) continue;
    try {
      const row = await patch(ev.id, { address: next });
      console.log(`    readback: address=«${row && row.address}»`);
    } catch (e) { console.log(`    ОШИБКА ${e.message}`); process.exit(4); }
  }
  console.log(`итог: правок ${plan}, skip ${skip}`);
})().catch(e => { console.error('падение:', e.message); process.exit(1); });
