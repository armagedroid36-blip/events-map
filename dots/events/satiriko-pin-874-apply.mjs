#!/usr/bin/env node
// Запуск 874: пин карточки стоит НЕ на театре «Сатирико», а на жилой улице Стрóволоса.
// Класс найден офлайн по прод-снапшоту (gen 08.11 21:23Z, 1307 карточек) зондом
// probe-873-addrpin.py: группа адреса «Театр «Сатирико» Никосия» распалась на ДВЕ точки —
// 10 карточек на 35.1632112,33.3864655 и 2 карточки на 35.1289906,33.3441035 (4.5 км).
//
// Арбитры (сняты в этом запуске):
//  1) лента Cyprus Now ?q=satiriko: у площадки ДВА слага — `satiriko-theatre-nicosia`
//     (35.16321120,33.38646550) и `satiriko-theatro-nicosia` (35.12899060,33.34410350);
//     «Galaxy of Talents 2026» 19.11 приходит именно со второго слага ⇒ точка взята из источника,
//     но источник ошибается (класс «два слага одной площадки, один врёт», см. Famagusta Tennis Club).
//  2) обратный геокодер Nominatim (zoom 18, en):
//     35.1632112,33.3864655 → «Satirikon Theatre, … Aglandjia, Nicosia District» — ТЕАТР;
//     35.1289906,33.3441035 → «7, Tzenis Karezi, Στρόβολος II, Strovolos» — жилая улица, не театр.
//     3) прямой поиск Nominatim «Satiriko Theatre Nicosia» / «Σατιρικό Θέατρο» → [] (имя в OSM
//        есть только как Satirikon Theatre на реверсе — поэтому вердикт по реверсу, а не по поиску).
//  4) 10 живых карточек той же площадки («Το Ψέμα», «Η Βασίλισσα του Χιονιού», «Бам!»,
//     «Imerologio Frankenstein») уже стоят на точке 35.1632112,33.3864655.
//
// ⇒ правим ТОЛЬКО пин (city/address не трогаем: address входит в ключ дедупа city|title+address).
//
// Использование:  node dots/events/satiriko-pin-874-apply.mjs          (dry-run)
//                 APPLY=1 node dots/events/satiriko-pin-874-apply.mjs   (запись)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении'); process.exit(2); }

const H = {
  apikey: KEY,
  Authorization: 'Bearer ' + KEY,
  'Content-Type': 'application/json',
};

const FROM = { lat: 35.1289906, lng: 33.3441035 };
const NEXT = { lat: 35.1632112, lng: 33.3864655 };

const ITEMS = [
  {
    id: 'a88134fb-2917-4d55-9df0-4feed5d0c9ce',
    title: 'Galaxy of Talents',
    start_date: '2026-11-19',
    why: 'Nominatim reverse 35.1289906,33.3441035 → «7, Tzenis Karezi, Strovolos» (жилая улица); театр — 35.1632112,33.3864655 («Satirikon Theatre, Aglandjia, Nicosia»)',
  },
  {
    id: 'c82bb94b-8d45-4294-b2a5-6d2bf832390d',
    title: 'Внутреннее',
    start_date: '2026-11-19',
    why: 'та же точка-обманка слага satiriko-theatro-nicosia; 10 живых карточек «Сатирико» стоят на 35.1632112,33.3864655',
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
  if (!String(row.city || '').toLowerCase().startsWith('никосия')) {
    console.log(`- ${p} город уже другой (${row.city}) — пропуск`); skipped++; continue;
  }
  if (!/атирико|satiriko/i.test(row.address || '')) {
    console.log(`- ${p} адрес не называет площадку (${row.address}) — пропуск`); skipped++; continue;
  }
  if (Math.abs((row.lat ?? 0) - FROM.lat) > 1e-4 || Math.abs((row.lng ?? 0) - FROM.lng) > 1e-4) {
    console.log(`- ${p} пин уже другой (${row.lat},${row.lng}) — пропуск`); skipped++; continue;
  }

  const body = { lat: NEXT.lat, lng: NEXT.lng };
  if (!APPLY) { console.log(`~ ${p} ${row.start_date} «${row.title}»: пин ${row.lat},${row.lng} → ${body.lat},${body.lng}`); done++; continue; }
  try {
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${it.id}&status=eq.active`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const upd = (await r.json())[0] || {};
    if (Math.abs((upd.lat ?? 0) - NEXT.lat) > 1e-6 || Math.abs((upd.lng ?? 0) - NEXT.lng) > 1e-6) {
      throw new Error(`readback не совпал: ${upd.lat},${upd.lng}`);
    }
    console.log(`+ ${p} пин → ${upd.lat},${upd.lng} (проверено readback)`);
    done++;
  } catch (e) {
    console.log(`! ${p} ${e.message}`); failed++;
  }
}

console.log(`Готово: правок ${done}, пропусков ${skipped}, ошибок ${failed}`);
if (failed) process.exit(1);
