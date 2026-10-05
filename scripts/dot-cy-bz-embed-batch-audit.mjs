// Пакетный пин кипрских карточек «на центровой точке города» по embed-координате страницы
// cyprus.bz (iframe maps/embed/v1/place?...&q=<lat>%2C<lng>).
// Каждая карточка проверяется ПО СВОЕЙ странице (страницы кэшируются), поэтому площадки
// с одинаковым родовым именем («Village square» в разных деревнях) не сливаются в одну группу.
// Страховки:
//   1) координата «настоящая» — 5+ знаков после точки у lat и lng (городские фолбэки: 3–4 знака);
//   2) округ координаты = округ метки city карточки (ловит чужой город: DownTown Live, Limassol → Никосия);
//   3) первое слово адреса карточки присутствует на её странице;
//   4) сдвиг < 50 м — карточка уже на месте.
// Запуск: node --env-file=.env scripts/dot-cy-bz-embed-batch-audit.mjs          (DRY)
//         APPLY=1 node --env-file=.env scripts/dot-cy-bz-embed-batch-audit.mjs
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtNear, districtOfCity, km } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const PROXY = 'http://127.0.0.1:10809';
const MAX_FETCH = Number(process.env.MAX_FETCH || 30);
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const CENTERS = new Set(['34.7071,33.0226', '34.9182,33.6194', '35.1856,33.3823', '34.7754,32.4245', '35.0375,34.0041', '35.1167,33.9432']);
const isCenter = (lat, lng) => CENTERS.has(String(Number(lat)) + ',' + String(Number(lng)));
const CITY_WORDS = /^(лимасол|ларнака|никосия|пафос|ая-напа|ая напа|фамагуста|протарас|паралимни|полис|кирения|limassol|larnaca|nicosia|paphos|ayia napa|famagusta|cyprus|кипр)\b/i;

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
  const token = (c.venueKey.match(/[a-zа-яё]{4,}/i) || [''])[0];
  const inPage = token ? html.toLowerCase().includes(token) : false;
  if (!m) { console.log(`${id8} «${title}» (${c.venueKey}): embed-координаты нет`); rejected++; continue; }
  const latS = m[1], lngS = m[2];
  const decOk = (latS.split('.')[1] || '').length >= 5 && (lngS.split('.')[1] || '').length >= 5;
  const lat = Number(latS), lng = Number(lngS);
  const dCity = districtOfCity(c.city);
  const dPoint = districtOf(lat, lng) || districtNear(lat, lng);
  const distOk = dCity ? dCity === dPoint : true;
  const shift = km(c.lat, c.lng, lat, lng);
  const why = [!decOk && 'фолбэк-точность', !distOk && `чужой округ (${dPoint})`, !inPage && 'нет имени площадки на странице'].filter(Boolean);
  if (why.length) { console.log(`${id8} «${title}» | ${c.venueKey} | ${latS},${lngS} | ОТКЛОНЕНО: ${why.join(', ')}`); rejected++; continue; }
  if (!(c.address || '').toLowerCase().includes(token)) { console.log(`${id8} «${title}»: адрес не называет «${token}»`); rejected++; continue; }
  if (shift < 0.05) { console.log(`${id8} «${title}»: уже на месте (${(shift * 1000).toFixed(0)} м)`); already++; continue; }
  const line = `${id8} «${title}» | ${c.venueKey} | ${c.city} | ${c.lat},${c.lng} -> ${lat},${lng} (${(shift * 1000).toFixed(0)} м)`;
  if (!APPLY) { console.log(`${line} [DRY]`); continue; }
  const { data, error } = await db.from('events').update({ lat, lng }).eq('id', c.id).select('id');
  if (error || !data?.length) { console.log(`${line} ОШИБКА: ${error?.message || 'обновлено 0 строк'}`); continue; }
  console.log(`${line} записано`);
  log.push(line);
  applied++;
}
console.log(`\nГотово: скачано страниц ${fetches}, применено ${applied}, уже на месте ${already}, отклонено ${rejected}, не проверено ${skipped}, режим ${APPLY ? 'APPLY' : 'DRY'}`);
