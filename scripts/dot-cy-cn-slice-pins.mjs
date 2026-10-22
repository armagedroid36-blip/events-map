// Пин по срезу города ленты Cyprus Now вместо ?q= по русскому транслиту.
//
// Зачем: `?q=` ищет по латинскому/греческому имени площадки, а адреса карточек cyprus.bz
// приходят РУССКИМ транслитом («Муниципальный театр Строволоса») — пересечения слов нет,
// поэтому словарный транслит даёт 1 из 42. Здесь обратный ход: строим ИНДЕКС площадок
// из срезов города (`?city=<слаг>&limit=200&offset=0,200,400`) и сопоставляем русский
// адрес с латинским именем по «скелету согласных» (гласные+h выброшены: Pattihio → ptt,
// «Паттихо» → ptt), общие слова «театр/центр/школа» сами по себе пины не дают —
// решение принимает человек через PIN (addr -> "name|lat|lng|cityKey").
//
// ПИТФОЛ: срезы города БОЛЬШИЕ (0.1–0.6 МБ) и с RU-IP Cloudflare обрывает ответ на
// 11–22 КБ → JSON.parse падает → «площадки нет». Срезы снимать curl-ом через прокси 10809:
//   for c in nicosia limassol paphos larnaca; do for o in 0 200 400; do
//     curl -s -m 30 -x http://127.0.0.1:10809 \
//       "https://cyprusnow.app/api/events?city=$c&limit=200&offset=$o" -o "$LOCALAPPDATA/Temp/cn-$c-$o.json"; done; done
// Запуск: node --env-file=.env scripts/dot-cy-cn-slice-pins.mjs            (DRY, печатает сопоставление)
//         APPLY=1 PIN='{"<адрес>":"<имя>|<lat>|<lng>|<город>"}' ...        (писать пины)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const APPLY = process.env.APPLY === '1';
const SINCE = process.env.SINCE || '2026-10-21T22:26:41Z';
const DIR = process.env.SLICE_DIR || (process.env.LOCALAPPDATA + '/Temp');
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const CENTER = { 'Лимасол': [34.7071, 33.0226], 'Никосия': [35.1856, 33.3823], 'Пафос': [34.7754, 32.4245], 'Ларнака': [34.9182, 33.6194] };
const CITY_EN = { 'Лимасол': 'limassol', 'Никосия': 'nicosia', 'Пафос': 'paphos', 'Ларнака': 'larnaca' };
const T = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
const words = s => (s || '').toLowerCase().replace(/[\u0430-\u044f\u0451]/g, c => T[c] ?? c)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const skel = w => w.replace(/[aeiouyh]/g, '');

async function all(from) {
  let out = [], off = 0;
  for (;;) {
    const { data, error } = await db.from('events').select('id,title,city,address,lat,lng,start_date,status,website,created_at')
      .gte('created_at', from).order('created_at', { ascending: true }).range(off, off + 999);
    if (error) throw new Error(error.message);
    out = out.concat(data); if (data.length < 1000) break; off += 1000;
  }
  return out;
}

const cands = [];
for (const r of (await all(SINCE)).filter(r => r.status === 'active')) {
  const cityKey = (r.city || '').split(',')[0].trim(); const c = CENTER[cityKey]; if (!c || r.lat == null) continue;
  if (Math.abs(r.lat - c[0]) > 0.0012 || Math.abs(r.lng - c[1]) > 0.0012) continue;
  const addr = (r.address || '').split(',')[0].trim(); if (!addr || addr.length < 3) continue;
  cands.push({ r, cityKey, c, addr });
}
console.log('кандидатов:', cands.length);

// индекс площадок из локальных срезов
const idx = {}; // city -> Map(name -> {lat,lng})
for (const city of Object.values(CITY_EN)) {
  const m = new Map();
  for (const off of [0, 200, 400]) {
    const p = `${DIR}/cn-${city}-${off}.json`;
    if (!fs.existsSync(p)) continue;
    let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    for (const e of (j.events || [])) { const v = e.venue || {}; if (v.name && v.lat != null && v.lng != null) m.set(v.name, { lat: +v.lat, lng: +v.lng }); }
  }
  idx[city] = m;
}
console.log('площадок в индексе:', Object.entries(idx).map(([k, v]) => k + ':' + v.size).join(' '));

const addrs = [...new Set(cands.map(x => x.addr))];
const out = [];
for (const addr of addrs) {
  const cityKeys = [...new Set(cands.filter(x => x.addr === addr).map(x => x.cityKey))];
  const ws = words(addr).filter(w => !['the', 'and', 'de', 'la'].includes(w));
  const sk = [...new Set(ws.map(skel).filter(s => s.length >= 3))];
  const hits = new Map();
  for (const ck of cityKeys) {
    const c = CENTER[ck];
    for (const [name, g] of idx[CITY_EN[ck]]) {
      if (Math.abs(g.lat - c[0]) < 0.0015 && Math.abs(g.lng - c[1]) < 0.0015) continue;
      const vsk = words(name).map(skel);
      const common = sk.filter(s => vsk.some(x => x === s || x.startsWith(s.slice(0, 4)) || s.startsWith(x.slice(0, 4))));
      if (common.length && common.join('').length >= 4) hits.set(name, { name, ck, ...g, common });
    }
  }
  out.push({ addr, n: cands.filter(x => x.addr === addr).length, cityKeys, hits: [...hits.values()] });
}
console.log('\nСОПОСТАВЛЕНИЕ:');
let ok = 0;
for (const a of out) {
  if (!a.hits.length) continue;
  ok++;
  console.log('++', a.addr, '(x' + a.n + ', ' + a.cityKeys.join('/') + ')');
  for (const h of a.hits.sort((x, y) => y.common.join('').length - x.common.join('').length).slice(0, 5)) {
    console.log('     ', h.name, '|', h.ck, h.lat.toFixed(7), h.lng.toFixed(7), '|', h.common.join(','));
  }
}
console.log('адресов с находками:', ok, 'из', out.length, APPLY ? '(APPLY)' : '(DRY)');

const PIN = JSON.parse(process.env.PIN || '{}'); // addr -> "name|lat|lng|cityKey"
if (APPLY && Object.keys(PIN).length) {
  let done = 0;
  for (const [addr, spec] of Object.entries(PIN)) {
    const [nm, latS, lngS, ck] = spec.split('|');
    const lat = +latS, lng = +lngS;
    for (const x of cands.filter(x => x.addr === addr && x.cityKey === ck)) {
      const d = Math.hypot((lat - x.c[0]) * 111, (lng - x.c[1]) * 90);
      if (d > 60) { console.log('SKIP далеко', x.r.id.slice(0, 8), d.toFixed(1)); continue; }
      const { data, error } = await db.from('events').update({ lat, lng }).eq('id', x.r.id).select('id,lat,lng,status,city,address,start_date,website');
      if (error || !data || !data.length || Math.abs(data[0].lat - lat) > 1e-7) { console.log('NOT-UPDATED', x.r.id.slice(0, 8), error && error.message); continue; }
      console.log('OK', x.r.id.slice(0, 8), '|', addr, '=>', nm, lat, lng, '| сдвиг', d.toFixed(2), 'км | status', data[0].status, '| city', data[0].city);
      done++;
    }
  }
  console.log('обновлено пинов:', done);
}
