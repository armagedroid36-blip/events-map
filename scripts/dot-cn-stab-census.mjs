// Точка «События»: постоянный зонд класса «ОДНА точка ленты Cyprus Now на РАЗНЫЕ площадки»
// (у CN есть сайтовые точки-заглушки по городам: Лимасол 34.6786322,33.0413055 API отдаёт
// и SynerJoy Music, и Suite48 Seafront Oasis, и Genetiou Mitella — это НЕ площадка, поэтому
// карточки с разными залами стоят на одной точке). Только чтение.
// Ручки: PROBE_STATUS (default active), PROBE_MIN (default 3), PROBE_LIMIT.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status,start_date,website');

const STATUS = (process.env.PROBE_STATUS || 'active').split(',');
const MIN = Number(process.env.PROBE_MIN || 3);
const LIMIT = Number(process.env.PROBE_LIMIT || 20);
const MINV = Number(process.env.PROBE_MIN_VENUES || 3); // сколько РАЗНЫХ площадок на одной точке считаем признаком заглушки

const GENERIC = new Set(['отель', 'hotel', 'resort', 'marina', 'bar', 'club', 'theatre', 'theater', 'square',
  'park', 'cyprus', 'cypus', 'кипр', 'улица', 'street', 'avenue', 'центр', 'hall', 'house', 'studio',
  'municipal', 'mu', 'limassol', 'nicosia', 'larnaca', 'paphos', 'лимасол', 'никосия', 'ларнака', 'пафос']);
const CITY_TOKENS = new Set(['limassol', 'nicosia', 'larnaca', 'paphos', 'лимасол', 'никосия', 'ларнака', 'пафос',
  'cyprus', 'cypus', 'кипр', 'kipr', 'kipros', 'ciprus', 'лаrnaca']);

const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', σ: 's', τ: 't', η: 'i', ι: 'i', κ: 'k',
  λ: 'l', ε: 'e', μ: 'm', ν: 'n', ο: 'o', π: 'p', ρ: 'r', α: 'a', θ: 'th', δ: 'd', χ: 'h', γ: 'g', υ: 'y', ω: 'o' };
const canon = (w) => [...w].map((c) => CYR[c] ?? c).join('').replace(/ph/g, 'f').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)) || lev(a, b) <= 2));

// «площадка» из адреса: слова кроме родовых и кроме города-уровня
function venueWords(addr, city) {
  const cityRu = canon(((city || '').split(',')[0] || '').toLowerCase().trim());
  return String(addr || '').toLowerCase().replace(/[«»"'(),.]/g, ' ').split(/\s+/)
    .map(canon)
    .filter((w) => w.length >= 4 && !GENERIC.has(w) && !CITY_TOKENS.has(w) && !/^\d+$/.test(w) && w !== cityRu);
}

const groups = new Map();
for (const r of rows) {
  if (!STATUS.includes(r.status) || r.lat == null || r.lng == null) continue;
  const key = `${Number(r.lat).toFixed(7)},${Number(r.lng).toFixed(7)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const flagged = [];
for (const [key, list] of groups) {
  if (list.length < MIN) continue;
  const cn = list.filter((r) => (r.website || '').includes('cyprusnow.app'));
  if (cn.length < MIN) continue;
  // схлопнуть площадки по написанию (транслит + Левенштейн)
  const venues = [];
  for (const r of list) {
    const w = venueWords(r.address, r.city).sort((a, b) => b.length - a.length)[0];
    if (!w) continue;
    if (!venues.some((v) => same(v.word, w))) venues.push({ word: w, ids: [r.id.slice(0, 8)] });
    else venues.find((v) => same(v.word, w)).ids.push(r.id.slice(0, 8));
  }
  if (venues.length < MINV) continue;
  flagged.push({ key, list, venues });
}

console.log(`живых (${STATUS.join(',')}) с гео: ${rows.filter((r) => STATUS.includes(r.status) && r.lat != null).length}`);
console.log(`точек ленты CN, где ОДНА точка несёт >=${MIN} карточек с РАЗНЫМИ площадками: ${flagged.length}`);
for (const g of flagged.slice(0, LIMIT).sort((a, b) => b.list.length - a.list.length)) {
  console.log(`\n${g.key} — карточек ${g.list.length}, разных площадок ${g.venues.length}: ${g.venues.map((v) => `${v.word}(${v.ids.length})`).join(' | ')}`);
  for (const r of g.list) console.log(`   ${r.id.slice(0, 8)} ${r.start_date} ${r.status} | ${r.address} | ${(r.title || '').slice(0, 50)}`);
}
