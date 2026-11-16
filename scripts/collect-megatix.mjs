// Сборщик событий Бали: Megatix (megatix.co.id) → база Supabase (статус «на модерации»).
//
// Почему этот источник: лента Балифорума не покрывает Керобокан, Улувату, Нуса-Дуа,
// Джимбаран, Санур (проверено запусками 931/933/934). Megatix — билетная платформа
// балийских клубов/студий: sitemap отдаёт ~833 URL /events/, страница события несёт
// ровно один JSON-LD `Event` с localTime (+08:00), площадкой, streetAddress и
// addressLocality. Координат в разметке НЕТ ⇒ пин берётся из центра района
// (scripts/bali-districts.mjs), а не выдумывается.
//
// Питфолы источника (замеры 934/935):
//  1) endDate у серии/регулярного события — окно серии, а не событие
//     (Bali Pub Crawl 17.11.2026→31.12.2027, DISSOLVE →28.09.2030). При разнице
//     больше суток end_date сводим к start_date (класс тур-интервала cyprus.bz).
//  2) в sitemap лежат устаревшие страницы (savaya: start=end 2024) ⇒ фильтр будущего.
//  3) листинги (/events, /bali) рендерятся JS — обход только через sitemap.
//
// Переменные окружения: SUPABASE_URL (или VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE.
// DRY_RUN=1 — печать без вставки. ONLY_LIMIT=N — сколько страниц максимум разобрать.
import { isQuotaError, quotaSkip } from './lib/quota.mjs'; // 402 по квоте — не красный прогон
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtForBali, districtCenter, OUT_OF_BALI } from './bali-districts.mjs';
import { cardAddressBali } from './bali-address.mjs';
import { cleanCurrency } from './currency.mjs';
import { cleanStartTime } from './start-time-stub.mjs';
import { cleanEndTime } from './end-time-guard.mjs';
import { stripInvisible } from './text-safe.mjs';
import { megatixPinForAddress } from './megatix-venue-pins.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const BASE = 'https://megatix.co.id';
const SITEMAP = `${BASE}/sitemap.xml`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const MAX_EVENTS = Number(process.env.MAX_EVENTS || 40); // новых карточек за прогон
const BUDGET_MIN = Number(process.env.MEGATIX_BUDGET_MIN || 8); // бюджет времени источника
const PAGES_MAX = Number(process.env.ONLY_LIMIT || 150); // предохранитель: страниц за прогон
const ZERO_YIELD_STOP = Number(process.env.MEGATIX_ZERO_YIELD || 60); // страниц подряд без добавлений
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 120);
const DRY_RUN = process.env.DRY_RUN === '1';

// ===== Категории: по названию, без LLM (источник не даёт типов) =====
const CAT_RULES = [
  [/pub crawl|party|night ?club|club night|rave|halloween|techno|house music|dj|free entry|entry/i, 'party'],
  [/concert|live music|orchestra|piano|jazz|band|gig|symphon/i, 'concert'],
  [/exhib|gallery|art\b|museum|paint|craft|pottery/i, 'exhibition'],
  [/brunch|dinner|food|wine|tasting|bbq|cooking/i, 'food'],
  [/workshop|retreat|conference|summit|seminar|training|course|masterclass/i, 'conference'],
  [/yoga|meditat|breath|sound healing|ecstatic|wellness|spa/i, 'lecture'],
  [/class|run|race|marathon|surf|fitness|tennis|football|padel|crossfit|swim/i, 'sport'],
  [/market|festival|fair|bazaar|carnival/i, 'festival'],
  [/\bquiz\b|trivia|game|board game|bingo|karaoke/i, 'games'],
  [/kids|children|family|daycare/i, 'festival'],
];

/** HTML-сущности в JSON-LD (`&amp;`, `&#39;`, `&quot;`) — норма у части страниц Megatix:
 *  прогон 43893899929 принёс «Creative Pottery &amp; Drawing Experience». Декодируем в точке
 *  чтения, иначе такие названия попадают на карту и в ключ дублей как есть. */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function pickCategory(title) {
  const t = String(title || '');
  for (const [re, id] of CAT_RULES) if (re.test(t)) return id;
  return 'lecture';
}

// ===== Утилиты =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function todayLocalBali() {
  // Дата по Бали (UTC+8) — источник даёт локальное время, сравнивать надо с ним.
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en,ru;q=0.8' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text(); // дочитываем тело: необорванный поток (класс шага 22)
    return text;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Все <loc> из sitemap → только страницы событий. */
function sitemapEventUrls(xml) {
  const urls = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const u = m[1].trim();
    if (!/\/events\/[^/?#]+/i.test(u)) continue;
    if (/\/events\/?$/i.test(u)) continue; // листинг
    urls.push(u.replace(/&amp;/g, '&'));
  }
  return [...new Set(urls)];
}

/** Достать из HTML JSON-LD объект события. */
function parseEventLd(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  const stack = [];
  for (const raw of blocks) {
    let data;
    try { data = JSON.parse(raw.trim()); } catch { continue; }
    stack.push(data);
  }
  const out = [];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    const t = node['@type'];
    const types = Array.isArray(t) ? t : [t];
    if (types.some((x) => String(x).toLowerCase() === 'event')) out.push(node);
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'subEvent']) {
      if (node[key]) stack.push(node[key]);
    }
  }
  return out[0] || null;
}

/** «2026-11-17T19:00:00+08:00» → { date, time } (локальная дата/время как в источнике). */
function splitLocal(iso) {
  const s = String(iso || '');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const time = `${m[2]}:${m[3]}`;
  return { date: m[1], time: time === '00:00' ? null : time };
}

function ldPlace(ev) {
  const loc = ev.location;
  const place = Array.isArray(loc) ? loc[0] : loc;
  if (!place) return { name: null, street: null, locality: null };
  const addr = place.address || {};
  return {
    name: typeof place.name === 'string' ? place.name : null,
    street: typeof addr === 'object' ? (addr.streetAddress || null) : (typeof addr === 'string' ? addr : null),
    locality: typeof addr === 'object' ? (addr.addressLocality || null) : null,
  };
}

function ldImage(ev) {
  const img = ev.image;
  const first = Array.isArray(img) ? img[0] : img;
  if (!first) return null;
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && first.url) return String(first.url);
  return null;
}

function ldPrice(ev) {
  const offers = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
  if (!offers) return { price: null, currency: null };
  const p = offers.price != null ? Number(offers.price) : (offers.lowPrice != null ? Number(offers.lowPrice) : null);
  return {
    price: Number.isFinite(p) ? p : null,
    currency: cleanCurrency(offers.priceCurrency || null),
  };
}

// ===== Дубли: ключ title|start_date + множество уже собранных страниц =====
async function existingKeys() {
  const rows = await selectAll(db, 'events', 'title, title_ru, title_en, start_date, website, status', {
    filter: (q) => q.in('status', ['active', 'moderation']),
  });
  const seen = new Set();
  const sites = new Set();
  for (const r of rows) {
    const date = String(r.start_date || '').slice(0, 10);
    for (const t of [r.title, r.title_ru, r.title_en]) {
      if (t) seen.add(`${String(t).trim().toLowerCase()}|${date}`);
    }
    if (r.website) sites.add(String(r.website).trim());
  }
  return { seen, sites, total: rows.length };
}

async function main() {
  const started = Date.now();
  const deadline = started + BUDGET_MIN * 60 * 1000;
  console.log(`Собираю: Megatix (sitemap ${BASE}/sitemap.xml, бюджет ${BUDGET_MIN} мин, лимит ${MAX_EVENTS})`);

  const { seen, sites, total } = await existingKeys();
  console.log(`Ключи дублей: ${seen.size}, страниц уже собрано: ${sites.size} (живых строк ${total})`);

  const xml = await fetchText(SITEMAP);
  if (!xml) throw new Error('sitemap недоступен');
  const urls = sitemapEventUrls(xml);
  console.log(`Страниц событий в sitemap: ${urls.length}`);

  const today = todayLocalBali();
  const horizon = addDays(today, DAYS_AHEAD);
  let inserted = 0;
  let skipped = 0;
  let scanned = 0;
  let past = 0;
  let noDistrict = 0;
  let venuePinned = 0;
  let lastYield = 0;

  for (const url of urls) {
    if (inserted >= MAX_EVENTS) { console.log(`[лимит] ${MAX_EVENTS} новых — стоп`); break; }
    if (scanned >= PAGES_MAX) { console.log(`[лимит] ${PAGES_MAX} страниц — стоп`); break; }
    if (Date.now() > deadline) { console.log('[дедлайн] бюджет времени источника исчерпан'); break; }
    if (scanned - lastYield >= ZERO_YIELD_STOP) { console.log(`[обрыв] ${ZERO_YIELD_STOP} страниц подряд без добавлений`); break; }
    const pageUrl = url.trim();
    if (sites.has(pageUrl)) { skipped++; continue; }

    const html = await fetchText(pageUrl);
    if (!html) { scanned++; continue; }
    const ev = parseEventLd(html);
    if (!ev) { scanned++; continue; }

    const start = splitLocal(ev.startDate);
    if (!start) { scanned++; continue; }
    if (start.date < today) { past++; scanned++; continue; } // устаревшая страница в sitemap
    if (start.date > horizon) { scanned++; continue; }

    const title = decodeEntities(stripInvisible(String(ev.name || ''))).trim().slice(0, 200);
    if (!title) { scanned++; continue; }

    const key = `${title.toLowerCase()}|${start.date}`;
    if (seen.has(key)) { skipped++; scanned++; continue; }

    const place = ldPlace(ev);
    // Поля адреса тоже несут HTML-сущности («Samadi Yoga &amp; Wellness Center»): без декода
    // они уезжают в `events.address` и печатаются на карточке (класс 938, но по адресу).
    const addressText = [place.street, place.locality, place.name]
      .filter(Boolean)
      .map((s) => decodeEntities(String(s)))
      .join(', ');
    const district = districtForBali(addressText, null);
    if (OUT_OF_BALI.has(district)) { scanned++; continue; }
    // Район не распознан ⇒ пин упал бы на центр ОСТРОВА (до 40 км мимо). Такую
    // карточку не берём: пин обязан называть район (правило 935/931).
    if (String(district || '').toLowerCase() === 'bali') {
      noDistrict++;
      scanned++;
      continue;
    }
    const cityLabel = `${district}, Bali`;
    // Гео в JSON-LD нет, поэтому по умолчанию пин — центр района (все события квартала в одной
    // точке). Проверенные пины площадок (геокодинг 941) лежат в словаре: сначала он, потом центр.
    const knownPin = megatixPinForAddress(addressText || place.name || '');
    if (knownPin) venuePinned++;
    const center = knownPin || districtCenter(district);

    // endDate = окно серии у большинства записей: интервал оставляем только на 1 день.
    const endRaw = splitLocal(ev.endDate);
    let endDate = null;
    let endTime = null;
    if (endRaw) {
      const span = diffDays(start.date, endRaw.date);
      if (span >= 0 && span <= 1) { endDate = endRaw.date; endTime = endRaw.time; }
    }
    const startTime = cleanStartTime(start.time);
    const price = ldPrice(ev);
    const photo = ldImage(ev);
    const desc = ev.description ? decodeEntities(stripInvisible(String(ev.description))).trim().slice(0, 3000) : null;

    const row = {
      title,
      title_en: title,
      title_ru: null,
      // Мегатикс описания не отдаёт, а колонка events.description — NOT NULL:
      // с null вставка падала на КАЖДОЙ карточке (прогон 43882819683: 36 отказов, «добавлено 0»).
      description: desc || '',

      description_ru: null,
      source_lang: 'en',
      language: 'en',
      start_date: start.date,
      end_date: endDate,
      start_time: startTime,
      end_time: cleanEndTime({ start_date: start.date, start_time: startTime, end_date: endDate, end_time: endTime }),
      city: cityLabel,
      address: cardAddressBali(addressText || place.name || null, cityLabel),
      lat: center.lat,
      lng: center.lng,
      category_id: pickCategory(title),
      website: pageUrl,
      contact: null,
      photos: photo ? [photo] : null,
      price: price.price,
      currency: price.currency,
      donation: false,
      is_international: false,
      recurrence: null,
      status: 'moderation',
      source_type: 'collector',
    };

    if (!DRY_RUN) {
      const { error } = await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${title.slice(0, 40)}»: ${error.message}`);
        scanned++;
        continue;
      }
    }
    inserted++;
    lastYield = scanned;
    seen.add(key);
    sites.add(pageUrl);
    console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${title.slice(0, 50)} (${row.city}, ${row.start_date} ${row.start_time || ''}) [${row.category_id}]`);
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`Готово: добавлено ${inserted}, пропущено дублей ${skipped}, страниц прочитано ${scanned}, прошедших ${past}, без района ${noDistrict}, пин по площадке ${venuePinned} (${mins} мин)`);
}

const isDirectRun = /collect-megatix\.mjs$/.test((process.argv[1] || '').replace(/\\/g, '/'));
if (isDirectRun && !process.env.COLLECT_MEGATIX_NO_RUN) {
  main().catch((e) => {
    if (isQuotaError(e)) quotaSkip();
    console.error('Критическая ошибка:', e.message);
    process.exit(1);
  });
}
