// dot-cy-cn-twin-probe.mjs — «двойник записи Cyprus Now»: у одного события лента держит
// ДВЕ записи (греческий и английский слаги), и площадку+координаты часто несёт только одна,
// тогда как карточка собиралась с другой (venue null) → пин на центровом фолбэке города.
// Зонд ищет по терминам (?q=) и печатает записи с venue; термины — аргументами:
//   node scripts/dot-cy-cn-twin-probe.mjs ballet "markideio" "vienna mozart"
// Дата/город на термине не обязательны: ?q= у CN ищет по всему острову.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const terms = process.argv.slice(2);
if (!terms.length) { console.error('укажи термины: node scripts/dot-cy-cn-twin-probe.mjs <термин> [...]'); process.exit(1); }

async function feed(t) {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch('https://cyprusnow.app/api/events?q=' + encodeURIComponent(t), { headers: { 'User-Agent': UA } });
      return JSON.parse(await r.text());
    } catch (e) {
      if (a === 3) { console.log('===', t, '-> ОШИБКА', e.message); return null; }
    }
  }
}

let withVenue = 0, nullVenue = 0;
for (const t of terms) {
  const j = await feed(t);
  if (!j) continue;
  const ev = j.events || [];
  console.log('===', t, '->', ev.length, 'записей');
  for (const e of ev) {
    const has = e.venue_name && e.venue_lat && e.venue_lng;
    if (has) withVenue++; else nullVenue++;
    console.log('  ', (e.start_at || '').slice(0, 10), (e.start_at || '').slice(11, 16), '|',
      has ? `ПЛОЩАДКА ${e.venue_name} ${e.venue_lat},${e.venue_lng}` : 'venue null',
      '|', e.city || '-', '|', e.slug);
    if (has) {
      const d = String(e.description || '').replace(/\s+/g, ' ');
      if (/venue|theatre|theater|θέατρο/i.test(d)) console.log('      desc:', d.slice(0, 240));
    }
  }
}
console.log('--- итог: с площадкой', withVenue, '| без площадки', nullVenue,
  '| площадку даёт двойник записи, а не своя запись карточки — сверять дату и событие');
