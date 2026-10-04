// Класс «живые дубли с аббревиатурой в названии»: строгий ключ по словам слеп,
// потому что «S.V.E.T.» нормализуется в токены длиной 1 и отбрасывается (w.length > 3).
// Радикальный признак пары, не зависящий от названия: тот же день + тот же город +
// тот же start_time и координаты <=300 м, ИЛИ тот же start_time и общий значимый
// (не шаблонный) токен адреса, ИЛИ координаты <=300 м при одинаковом адресе.
// Только чтение: печатает группы-кандидаты. Ремонт — отдельным скриптом после глазами.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { words, norm, cityKey, dayKey, distanceM, hasCoords, liveDupeMatch, isCityLevelAddr, GENERIC, PLACE_STOP, STOP } from './live-dupe-key.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const all = await selectAll(db, 'events', 'id,title,title_ru,title_en,city,address,start_date,start_time,lat,lng,status,website,source_type');
const live = all.filter((r) => r.status === 'active');
console.log(`Всего строк ${all.length}, active ${live.length}`);

const t5 = (r) => String(r.start_time || '').slice(0, 5);
// Слова адреса-«воды»: сами по себе не доказывают одно место
const ADDR_STOP = new Set(['municipal', 'community', 'square', 'centre', 'center', 'cultural', 'площадь',
  'central', 'theatre', 'theater', 'bar', 'resto', 'hotel', 'stage', 'park', 'парк']);
const placeWords = (s) => new Set(words(s).filter((w) => !GENERIC.has(w) && !PLACE_STOP.has(w) && !ADDR_STOP.has(w)));
// Схлопывание аббревиатур: «S.V.E.T.» → «svet», «С.В.Е.Т.» → «свет»
const collapse = (s) => String(s || '').replace(/(\p{L})\./gu, '$1');
const awords = (s) => [...new Set(norm(collapse(s)).split(' ').filter((w) => w.length > 2 && /\p{L}/u.test(w) && !STOP.has(w) && !GENERIC.has(w)))];
const aOverlap = (a, b) => {
  let best = 0;
  for (const ta of [a.title, a.title_ru, a.title_en].filter(Boolean).map(collapse))
    for (const tb of [b.title, b.title_ru, b.title_en].filter(Boolean).map(collapse)) {
      const sb = new Set(awords(tb)); let n = 0;
      for (const w of awords(ta)) if (sb.has(w)) n++;
      best = Math.max(best, n);
    }
  return best;
};

function abbrevMatch(a, b) {
  if (dayKey(a) !== dayKey(b)) return null;
  const ta = t5(a), tb = t5(b);
  const sameTime = !!ta && ta === tb;
  const near = hasCoords(a) && hasCoords(b) ? distanceM(a, b) : null;
  const na = norm(a.address), nb = norm(b.address);
  const addrEq = !!na && na === nb;
  const sa = placeWords(na), sb = placeWords(nb);
  let common = null;
  for (const w of sa) if (sb.has(w)) { common = w; break; }
  // координаты-заглушки центра города у обеих карточек — сигнал недействителен
  const stubBoth = isCityLevelAddr(a) && isCityLevelAddr(b);
  const coordOk = !stubBoth && near !== null && near <= 300;
  const ov = aOverlap(a, b);

  if (ov >= 3) return `аббрев-слов ${ov}${common ? ' + адрес~' + common : coordOk ? ' + коорд=' + Math.round(near) + 'м' : ' (имя)'}`;
  if (ov >= 2 && (common || coordOk)) return `аббрев-слов ${ov} + ${common ? 'адрес~' + common : 'коорд=' + Math.round(near) + 'м'}`;
  if (sameTime && common) return `час=${ta} адрес~${common}`;
  if (coordOk && sameTime && addrEq) return `час=${ta} коорд=${Math.round(near)}м (адрес=)`;
  return null;
}

// группировка по день+город
const groups = new Map();
for (const r of live) {
  const k = dayKey(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const found = [];
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j];
    if (liveDupeMatch(a, b)) continue; // уже ловится строгим ключом — не наш класс
    const why = abbrevMatch(a, b);
    if (why) found.push({ k, a, b, why });
  }
}

// union-find по найденным парам
const par = new Map();
const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
const union = (x, y) => { par.set(find(x), find(y)); };
const ids = new Set();
for (const f of found) { for (const r of [f.a, f.b]) { ids.add(r.id); if (!par.has(r.id)) par.set(r.id, r.id); } }
for (const f of found) union(f.a.id, f.b.id);
const byRoot = new Map();
for (const id of ids) { const r = find(id); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(id); }

console.log(`Пар-кандидатов: ${found.length}; групп: ${byRoot.size}`);
let n = 0;
for (const [, list] of byRoot) {
  n++;
  const rows = list.map((id) => live.find((r) => r.id === id));
  const whys = new Set(found.filter((f) => list.includes(f.a.id) && list.includes(f.b.id)).map((f) => f.why));
  console.log(`\n#${n} ${rows[0].start_date} | ${cityKey(rows[0])} | ${[...whys].join(' / ')}`);
  for (const r of rows) {
    console.log(`   ${r.id.slice(0, 8)} | ${r.start_time || '--:--'} | ${(r.title_ru || r.title || '').slice(0, 55)} | ${norm(r.address).slice(0, 40)} | ${hasCoords(r) ? r.lat.toFixed(5) + ',' + r.lng.toFixed(5) : 'без коорд'} | ${r.source_type}`);
  }
}
