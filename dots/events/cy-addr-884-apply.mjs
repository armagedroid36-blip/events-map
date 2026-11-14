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
  { id: '31e0df3f', expectCity: 'Пафос' },
  { id: '99143754', expectCity: 'Никосия' },
  { id: 'aed3b1df', expectCity: 'Никосия' },
  { id: 'd49ed492', expectCity: 'Лимасол' },
  { id: '89e345be', expectCity: 'Никосия' },
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
    if (!isStub(ev.address)) { console.log(`SKIP ${it.id}: адрес уже «${ev.address}»`); skip++; continue; }
    const next = ev.city;                       // ровно то, что положит сборщик (фолбэк = канон города)
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
