// Пакетный пин кипрских карточек «на центровой точке города» по embed-координате страницы
// cyprus.bz — версия с УЛУЧШЕННОЙ сверкой имени площадки (запуск 59).
// Отличие от dot-cy-bz-embed-batch-audit.mjs: проверка №3 «имя площадки есть на странице»
// больше не требует точного вхождения слова — сравниваются варианты написания:
//   * транслитерация (как раньше);
//   * ФУЗЗИ: расстояние Левенштейна <=2 для слов длиной >=6 («tehnopolis»~«technopolis»,
//     «pezogefira»~«pezogefyra», «kaymakly»~«kaimakli», «fri»~«free»);
//     ложных пропусков это не даёт, т.к. остальные 3 страховки на месте.
// Все прочие страховки прежние: точность (5+ знаков), округ координаты = округ метки city,
// адрес карточки называет площадку, сдвиг > 50 м. В лог печатается найденное на странице слово.
// Запуск: node --env-file=.env scripts/dot-cy-bz-embed-fuzzy-audit.mjs          (DRY)
//         APPLY=1 node --env-file=.env scripts/dot-cy-bz-embed-fuzzy-audit.mjs
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtNear, districtOfCity, km } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const PROXY = 'http://127.0.0.1:10809';
const MAX_FETCH = Number(process.env.MAX_FETCH || 40);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const CENTERS = new Set(['34.7071,33.0226', '34.9182,33.6194', '35.1856,33.3823', '34.7754,32.4245', '35.0375,34.0041', '35.1167,33.9432']);
const isCenter = (lat, lng) => CENTERS.has(String(Number(lat)) + ',' + String(Number(lng)));
const GENERIC = new Set(['отель', 'hotel', 'resort', 'marina', 'марина', 'bar', 'бар', 'club', 'клуб', 'restaurant', 'ресторан', 'cafe', 'кафе', 'square', 'park', 'парк', 'center', 'центр', 'street', 'улица', 'venue', 'place', 'hall', 'theatre', 'театр', 'house', 'хаус', 'beach', 'бич', 'mall', 'molos', 'ломос', 'район', 'area', 'мыс', 'cape', 'city', 'town']);
const CITY_WORDS = /^(лимасол|ларнака|никосия|пафос|ая-напа|ая напа|фамагуста|протарас|паралимни|полис|кирения|limassol|larnaca|nicosia|paphos|ayia napa|famagusta|cyprus|кипр)\b/i;
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = (s) => s.toLowerCase().split('').map((ch) => TR[ch] ?? ch).join('');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const rows = await selectAll(db, 'events', 'id,title,title_ru,city,address,lat,lng,status,start_date,website');

const cache = new Map();
function fetchPage(url) {
  if (cache.has(url)) return cache.get(url);
  let html = '';
  try { html = execFileSync('curl', ['-s', '-L', '-m', '25', '--proxy', PROXY, url], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8'); } catch { html = ''; }
  cache.set(url, html);
  return html;
}

const cands = [];
for (const r of rows) {
  if (r.status === 'archived') continue;
  if (!isCenter(r.lat, r.lng)) continue;
  const addr = (r.address || '').trim();
  if (addr.length < 8) continue;
  const first = addr.split(/[,;]/)[0].trim();
  if (CITY_WORDS.test(first)) continue;
  const site = String(r.website || '');
  if (!/cyprus\.bz\/(?:ru\/|en\/)?event\/[0-9a-f]+/i.test(site)) continue;
  cands.push({ ...r, venueKey: first.toLowerCase().replace(/[«»"'`]/g, '').trim(), page: site.replace(/cyprus\.bz\/(?:ru|en)\/event\//i, 'cyprus.bz/event/') });
}
console.log('кандидатов с источником cyprus.bz:', cands.length, '| уникальных площадок:', new Set(cands.map((c) => c.venueKey)).size);

let fetches = 0, applied = 0, rejected = 0, already = 0, skipped = 0;
const log = [];
for (const c of cands) {
  if (fetches >= MAX_FETCH && !cache.has(c.page)) { skipped++; continue; }
  if (!cache.has(c.page)) fetches++;
  const html = fetchPage(c.page);
  const id8 = c.id.slice(0, 8);
  const title = (c.title_ru || c.title || '').slice(0, 40);
  if (!html) { console.log(`${id8} «${title}»: страница не скачалась`); rejected++; continue; }
  const m = html.match(/maps\/embed\/v1\/place[^"]*q=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
  if (!m) { console.log(`${id8} «${title}» (${c.venueKey}): embed-координаты нет`); rejected++; continue; }
  const words = (c.venueKey.match(/[a-zа-яё]{4,}/gi) || []).map((w) => w.toLowerCase()).filter((w) => !GENERIC.has(w));
  const pick = [...words].sort((a, b) => b.length - a.length)[0] || '';
  const tokens = [...new Set(words.flatMap((w) => [w, translit(w)].filter((t) => t.length >= 4)))];
  const pageText = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').toLowerCase();
  const pageWords = [...new Set((pageText.match(/[a-z]{4,}/g) || []))];
  // точное совпадение, затем варианты написания (фуззи <=2 для слов от 6 букв)
  let hit = tokens.find((t) => pageText.includes(t)) || '';
  if (!hit) {
    for (const t of tokens) {
      const near = pageWords.find((w) => (t.length >= 6 && w.length >= 5 && lev(t, w) <= 2) || (t.length >= 5 && w.startsWith(t.slice(0, 5))));
      if (near) { hit = near; break; }
    }
  }
  const latS = m[1], lngS = m[2];
  const decOk = (latS.split('.')[1] || '').length >= 5 && (lngS.split('.')[1] || '').length >= 5;
  const lat = Number(latS), lng = Number(lngS);
  const dCity = districtOfCity(c.city);
  const dPoint = districtOf(lat, lng) || districtNear(lat, lng);
  const distOk = dCity ? dCity === dPoint : true;
  const shift = km(c.lat, c.lng, lat, lng);
  const why = [!decOk && 'фолбэк-точность', !distOk && `чужой округ (${dPoint})`, !hit && 'нет имени площадки на странице'].filter(Boolean);
  if (why.length) { console.log(`${id8} «${title}» | ${c.venueKey} | ${latS},${lngS} | ОТКЛОНЕНО: ${why.join(', ')}`); rejected++; continue; }
  const firstToken = pick;
  if (!(c.address || '').toLowerCase().includes(firstToken) && !translit(c.address || '').includes(firstToken)) { console.log(`${id8} «${title}»: адрес не называет «${firstToken}»`); rejected++; continue; }
  if (shift < 0.05) { console.log(`${id8} «${title}»: уже на месте (${(shift * 1000).toFixed(0)} м)`); already++; continue; }
  const line = `${id8} «${title}» | ${c.venueKey} | ${c.city} | сопоставлено «${hit}» | ${c.lat},${c.lng} -> ${lat},${lng} (${(shift * 1000).toFixed(0)} м)`;
  if (!APPLY) { console.log(`${line} [DRY]`); continue; }
  const { data, error } = await db.from('events').update({ lat, lng }).eq('id', c.id).select('id');
  if (error || !data?.length) { console.log(`${line} ОШИБКА: ${error?.message || 'обновлено 0 строк'}`); continue; }
  console.log(`${line} записано`);
  log.push(line);
  applied++;
}
console.log(`\nГотово: скачано страниц ${fetches}, применено ${applied}, уже на месте ${already}, отклонено ${rejected}, не проверено ${skipped}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
