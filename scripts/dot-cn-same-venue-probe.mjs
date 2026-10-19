// Постоянный зонд класса «ДВЕ записи ленты Cyprus Now на ОДНО событие».
// Кейс-эталон (запуск 215): Limassol Christmas Show — две записи с ОДНОЙ точкой площадки
// до 7-го знака (34.6941201,33.0150894), разные слаги и разные названия/даты.
// Зонд: группирует записи ленты 7 городов по точке площадки (6 знаков ~11 см) и печатает
// группы из 2+ записей с РАЗНЫМИ слагами; отдельно — группы, у которых 2+ страницы уже
// стоят в базе ЖИВЫМИ карточками (это дефект на карте, а не будущая вставка).
// Запуск: node --env-file=.env scripts/dot-cn-same-venue-probe.mjs
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { execFileSync } from 'node:child_process';
import { cnDuplicateOf } from './cy-duplicate-pages.mjs';
import { isWindowSeries } from './cn-window-series.mjs';

const PROXY = process.env.PROXY === '0' ? null : 'http://127.0.0.1:10809';
function curl(url) {
  const a = ['-s', '--max-time', '40'];
  if (PROXY) a.push('-x', PROXY);
  a.push(url);
  try { return execFileSync('curl', a, { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 }); }
  catch (e) { if (PROXY) { const b = ['-s', '--max-time', '40', url]; return execFileSync('curl', b, { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 }); } throw e; }
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const cards = await selectAll(db, 'events', 'title, start_date, city, website, status');
const liveByPage = new Map();
for (const c of cards) {
  const w = (c.website || '').trim(); if (!w) continue;
  if (c.status !== 'active' && c.status !== 'moderation') continue;
  if (!liveByPage.has(w)) liveByPage.set(w, []);
  liveByPage.get(w).push(c);
}

const CITY = ['famagusta', 'protaras', 'paralimni', 'larnaca', 'paphos', 'limassol', 'nicosia'];
const seen = new Set();
const recs = [];
for (const city of CITY) {
  let data = null;
  try { data = JSON.parse(curl(`https://cyprusnow.app/api/events?city=${city}&limit=200`)); }
  catch (e) { console.log('[лента]', city, 'ERR', e.message); continue; }
  let n = 0;
  for (const ev of (data?.events || [])) {
    const slug = String(ev.slug || '').trim();
    const url = String(ev.url || (slug ? `https://cyprusnow.app/event/${slug}` : '')).trim();
    const key = url || slug; if (!key || seen.has(key)) continue; seen.add(key);
    const lat = Number(ev.venue_lat ?? ev.venue?.lat); const lng = Number(ev.venue_lng ?? ev.venue?.lng);
    n++;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    recs.push({
      slug, url, city,
      title: String(ev.title || ev.name || '').trim(),
      venue: String(ev.venue_name || ev.venue?.name || '').trim(),
      start: String(ev.start_at || ev.start_date || '').slice(0, 16),
      end: String(ev.end_at || ev.end_date || '').slice(0, 16),
      pt: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    });
  }
  console.log('[лента]', city, n);
}

// Одна площадка — это ещё не одно событие: в одном театре/клубе идут разные события.
// Признак ДУБЛЯ записи (кейс 215): та же точка площадки + та же нормализованная ТЕМА
// названия + пересекающиеся (или совпадающие) даты. Та же тема без пересечения дат =
// СЕРИЯ отдельных представлений/занятий (сворачивать нельзя, SERIES_DO_NOT_COLLAPSE).
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const groups = new Map();
for (const r of recs) { if (!groups.has(r.pt)) groups.set(r.pt, []); groups.get(r.pt).push(r); }

const overlaps = (a, b) => {
  const aS = a.start.slice(0, 10), aE = (a.end || a.start).slice(0, 10);
  const bS = b.start.slice(0, 10), bE = (b.end || b.start).slice(0, 10);
  return aS <= bE && bS <= aE;
};

let multi = 0; let dupPairs = 0; let seriesPairs = 0;
const dupList = []; const seriesList = []; const nearDup = new Map();
for (const [pt, list] of groups) {
  const slugs = new Set(list.map((r) => r.slug));
  if (list.length < 2 || slugs.size < 2) continue;
  multi++;
  const byTitle = new Map();
  for (const r of list) { const k = norm(r.title); if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(r); }
  for (const [k, tl] of byTitle) {
    if (tl.length < 2 || !k) continue;
    const cross = tl.some((a, i) => tl.some((b, j) => j > i && overlaps(a, b)));
    // Пересечение может быть не дублем, а ОКНОМ тура, накрывающим отдельные вечера (336)
    if (cross && isWindowSeries(tl)) { seriesList.push({ pt, k, tl, win: true }); seriesPairs++; }
    else { (cross ? dupList : seriesList).push({ pt, k, tl }); if (cross) dupPairs++; else seriesPairs++; }
  }
  // Кейс-эталон 215 имеет РАЗНЫЕ названия записей («Limassol Christmas Show: Festive Magic
  // at St. George Havouzas» ↔ «Limassol Christmas Show 2026»), поэтому точного совпадения темы
  // мало: пара ищется по пересечению значимых слов (длина >=5, цифры и слова площадки не в счёт)
  // при той же точке площадки и пересекающихся датах.
  const venueTokens = new Set(norm(list[0].venue || '').split(' ').filter((w) => w.length >= 4));
  const sig = (r) => new Set(norm(r.title).split(' ').filter((w) => w.length >= 5 && !/^\d+$/.test(w) && !venueTokens.has(w)));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]; const b = list[j];
    if (a.slug === b.slug || !overlaps(a, b)) continue;
    const A = sig(a); const common = [...sig(b)].filter((w) => A.has(w));
    if (common.length < 2) continue;
    const key = [a.slug, b.slug].sort().join('|');
    if (nearDup.has(key)) continue;
    nearDup.set(key, { pt, common, a, b });
  }
}
const show = (g) => {
  const live = g.tl.filter((r) => liveByPage.has(r.url) || liveByPage.has(r.slug));
  const guarded = g.tl.some((r) => cnDuplicateOf(r.url) || cnDuplicateOf(r.slug));
  const newOnes = g.tl.filter((r) => r.url && !liveByPage.has(r.url));
  const flag = live.length >= 2 ? '!!! ДЕФЕКТ НА КАРТЕ' : (newOnes.length ? (guarded ? 'страховка есть, часть не в базе' : 'РИСК: часть записей не в базе') : 'уже одна карточка');
  console.log(`${flag} | ${g.pt} | ${g.tl[0].venue || '—'}`);
  for (const r of g.tl) {
    const st = liveByPage.has(r.url) ? 'карточка' : (cnDuplicateOf(r.url) || cnDuplicateOf(r.slug) ? 'страховка' : 'НЕТ в базе');
    console.log(`   ${r.start}→${r.end || '-'} | ${st} | ${r.title.slice(0, 55)} | ${r.slug.slice(0, 55)}`);
  }
};
console.log(`\nзаписей ленты с площадкой: ${recs.length} | групп по точке (2+ записи, разные слаги): ${multi}`);
console.log(`\n=== ДУБЛЬ ЗАПИСИ: та же площадка + та же тема + пересечение дат — ${dupPairs} ===`);
for (const g of dupList) show(g);
console.log(`\n=== СЕРИЯ (та же тема, даты не пересекаются, сворачивать нельзя) — ${seriesPairs} ===`);
for (const g of seriesList.slice(0, 40)) { console.log(`${g.win ? 'серия-окно' : 'серия'} | ${g.pt} | ${g.k.slice(0, 55)} | записей ${g.tl.length} | дней: ${g.tl.map((r) => r.start.slice(0, 10)).join(', ')}`); }
console.log(`\n=== ПАРЫ ПО ЗНАЧИМЫМ СЛОВАМ (разные названия, общая площадка, пересечение дат) — ${nearDup.size} ===`);
for (const g of nearDup.values()) {
  const st = (r) => (liveByPage.has(r.url) ? 'карточка' : (cnDuplicateOf(r.url) || cnDuplicateOf(r.slug) ? 'страховка' : 'НЕТ в базе'));
  const guarded = cnDuplicateOf(g.a.url) || cnDuplicateOf(g.a.slug) || cnDuplicateOf(g.b.url) || cnDuplicateOf(g.b.slug);
  const flag = guarded ? 'УЖЕ под страховкой 215' : 'ПРОВЕРИТЬ';
  console.log(`${flag} | ${g.pt} | общих слов: ${g.common.join(', ')}`);
  for (const r of [g.a, g.b]) console.log(`   ${r.start}→${r.end || '-'} | ${st(r)} | ${r.title.slice(0, 55)} | ${r.slug.slice(0, 55)}`);
}
