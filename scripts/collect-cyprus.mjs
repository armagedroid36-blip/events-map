// Сборщик событий Кипра: три источника → база Supabase (статус «на модерации»).
//   1) VisitCyprus — официальный календарь туристического ведомства (REST API
//      The Events Calendar: /wp-json/tribe/events/v1/events). Структурированные
//      поля, но координат нет — геокодим адрес площадки.
//   2) Cyprus Now (cyprusnow.app) — агрегатор с готовыми координатами площадок
//      (/api/events?city=...).
//   3) Cyprus.BZ — русскоязычная афиша острова: страницы событий перечисляются
//      sitemap-ом, данные лежат в JSON-LD (schema.org/Event).
// Запуск: GitHub Actions по расписанию или вручную. Переменные окружения:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE, DEEPSEEK_API_KEY (категория через LLM).
import { createClient } from '@supabase/supabase-js';
import { extractCategory } from './category-llm.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';

if ((!SUPABASE_URL || !SERVICE_ROLE) && !DRY_RUN) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE (или DRY_RUN=1 для проверки без записи)');
  process.exit(1);
}

const db = !SUPABASE_URL || !SERVICE_ROLE
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 150); // предохранитель на запуск
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 120);  // горизонт планирования
const DESC_LIMIT = 3000;
const GEOCODE_PAUSE_MS = 1100; // лимит Nominatim: не чаще 1 запроса в секунду
// Только выбранные источники (для отладки): ONLY=visitcyprus,cyprusbz
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (name) => !ONLY.length || ONLY.includes(name);

// ===== Города Кипра: русское название + центр (fallback, если адрес не геокодится) =====
const CY_CITIES = {
  Лимасол: { lat: 34.7071, lng: 33.0226 },
  Никосия: { lat: 35.1856, lng: 33.3823 },
  Ларнака: { lat: 34.9182, lng: 33.6194 },
  Пафос: { lat: 34.7754, lng: 32.4245 },
  'Ая-Напа': { lat: 34.9889, lng: 33.9993 },
  Протарас: { lat: 35.0108, lng: 34.0573 },
  Паралимни: { lat: 35.0395, lng: 33.9835 },
  Фамагуста: { lat: 35.1205, lng: 33.9432 },
  Полис: { lat: 35.0354, lng: 32.4259 },
};

/** Английское написание города -> русское (единый вид поля city) */
const CITY_RU = {
  limassol: 'Лимасол', lemesos: 'Лимасол', lemessos: 'Лимасол',
  nicosia: 'Никосия', lefkosia: 'Никосия', lefkosa: 'Никосия', strovolos: 'Никосия', latsia: 'Никосия',
  larnaca: 'Ларнака', larnaka: 'Ларнака',
  paphos: 'Пафос', pafos: 'Пафос', peyia: 'Пафос', pейia: 'Пафос',
  'ayia napa': 'Ая-Напа', 'agia napa': 'Ая-Напа', ayanapa: 'Ая-Напа',
  'айя-напа': 'Ая-Напа', 'айя напа': 'Ая-Напа', 'ая напа': 'Ая-Напа',
  protaras: 'Протарас',
  paralimni: 'Паралимни',
  famagusta: 'Фамагуста', ammochostos: 'Фамагуста',
  polis: 'Полис', latchi: 'Полис',
  germasogeia: 'Лимасол', 'germasoyia': 'Лимасол', mesa: 'Лимасол', pyrgos: 'Лимасол',
  pissouri: 'Лимасол', episkopi: 'Лимасол', 'kolossi': 'Лимасол',
  kourion: 'Лимасол', 'kouklia': 'Пафос',
  // русские варианты — как есть
  лимасол: 'Лимасол', никосия: 'Никосия', ларнака: 'Ларнака', пафос: 'Пафос',
  'ая-напа': 'Ая-Напа', протарас: 'Протарас', паралимни: 'Паралимни', фамагуста: 'Фамагуста',
};

/** Город по латинскому/русскому тексту (площадка, slug, адрес) */
function cityRu(text) {
  const low = String(text || '').toLowerCase();
  if (!low) return '';
  for (const [key, ru] of Object.entries(CITY_RU)) {
    if (key.length > 3 && low.includes(key)) return ru;
  }
  for (const ru of Object.keys(CY_CITIES)) {
    if (low.includes(ru.toLowerCase())) return ru;
  }
  return '';
}

/** Ближайший крупный город по координатам — когда площадка названа незнакомо */
function nearestCity(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(CY_CITIES)) {
    const d = (lat - c.lat) ** 2 + (lng - c.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return bestD < 0.35 ? best : best || 'Лимасол'; // ~60 км: остров целиком
}

// ===== Категории VisitCyprus -> наши id =====
const VC_CAT = {
  music: 'concert', 'musical/opera': 'concert', dance: 'concert', theatre: 'theatre',
  cinema: 'cinema', festivals: 'festival', festival: 'festival', cultural: 'festival',
  'art exhibition': 'exhibition', exhibition: 'exhibition', workshop: 'workshop',
  gastronomy: 'food', 'food & drink': 'food', 'food and drink': 'food', wine: 'food',
  lecture: 'lecture', business: 'conference', charity: 'meetup',
  sports: 'sport', basketball: 'sport', football: 'sport', tennis: 'sport', volleyball: 'sport',
  'beach tennis': 'sport', golf: 'sport', cycling: 'sport', running: 'sport', swimming: 'sport',
  sailing: 'sport', rowing: 'sport', diving: 'sport', 'bird watching': 'tour', hiking: 'tour',
  'taekwon-do': 'sport', shooting: 'sport', 'technology festival': 'festival',
};

// ===== Утилиты =====
function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function stripHtml(html) {
  return decodeEntities(String(html || ''))
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, (m, href, txt) => (txt.trim() ? `${txt.trim()} (${href})` : ''))
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, DESC_LIMIT);
}

/** Цена из строки вида «€10 – €18», «Free», «€5, students free» → {price, currency, free} */
function parseCost(text) {
  const s = String(text || '').trim();
  if (!s) return {};
  if (/(free|бесплат|вход свободн|no charge|δωρεάν)/i.test(s) && !/€|\d/.test(s)) {
    return { price: 0, currency: 'eur', free: true };
  }
  const amounts = [...s.matchAll(/(?:€|EUR\s?)\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:€|EUR)/gi)]
    .map((m) => parseFloat((m[1] || m[2]).replace(',', '.')))
    .filter((n) => Number.isFinite(n));
  if (amounts.length) return { price: Math.min(...amounts), currency: 'eur', free: Math.min(...amounts) === 0 };
  if (/(free|бесплат|вход свободн|δωρεάν)/i.test(s)) return { price: 0, currency: 'eur', free: true };
  return {};
}

/** Ключ дубля: нормализованное название + дата (для сравнения по всей базе и внутри запуска) */
function normKey(title, date) {
  const t = decodeEntities(String(title || ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return `${t}|${String(date || '').slice(0, 10)}`;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const horizonStr = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + DAYS_AHEAD);
  return d.toISOString().slice(0, 10);
};

async function fetchText(url, accept = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', timeoutMs = 60000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en,ru;q=0.8,el;q=0.6' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 60000) {
  const text = await fetchText(url, 'application/json', timeoutMs);
  try {
    return JSON.parse(text);
  } catch {
    // Cyprus Now отдаёт ответ медленно и может оборваться: достраиваем массив
    // из последних полностью полученных объектов.
    const start = text.indexOf('"events":[');
    if (start === -1) throw new Error('ответ не JSON');
    const body = text.slice(start + '"events":['.length);
    const cut = body.lastIndexOf('},{');
    if (cut === -1) throw new Error('ответ обрезан');
    return JSON.parse(`{"success":true,"events":[${body.slice(0, cut + 1)}]}`);
  }
}

/**
 * Забрать текст с «бюджетом времени»: часть серверов (cyprus.bz) отдаёт
 * большие файлы крайне медленно и обрывает соединение. Возвращаем то, что
 * успели прочитать — для sitemap этого достаточно (обрезанный XML всё ещё
 * содержит полные <loc>-записи).
 */
async function fetchPartial(url, budgetMs = 90000, accept = 'application/xml,text/html;q=0.9,*/*;q=0.8') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  let text = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'ru,en;q=0.8' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
  } catch {
    // таймаут/обрыв — работаем с прочитанным
  } finally {
    clearTimeout(timer);
  }
  if (!text) throw new Error('пустой ответ');
  return text;
}

// ===== Геокодинг (Nominatim, 1 запрос в секунду, с кэшем) =====
const geoCache = new Map();
let lastGeo = 0;

async function geocode(query) {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = Math.max(0, GEOCODE_PAUSE_MS - (Date.now() - lastGeo));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  let out = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.[0]) out = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    out = null;
  }
  geoCache.set(key, out);
  return out;
}

// ===== Дедупликация по базе =====
async function existingKeys() {
  if (!db) return new Set();
  const { data, error } = await db.from('events').select('title, start_date');
  if (error) {
    console.error('Ошибка чтения дублей:', error.message);
    return new Set();
  }
  return new Set((data || []).map((e) => normKey(e.title, e.start_date)));
}

// ===== Запись события =====
const stats = { visitcyprus: 0, cyprusnow: 0, cyprusbz: 0, skipped: 0, errors: 0 };

async function save(row, seen) {
  const key = normKey(row.title, row.start_date);
  if (!row.title || !row.start_date) return false;
  if (seen.has(key)) {
    stats.skipped++;
    return false;
  }
  if (row.start_date < todayStr() || row.start_date > horizonStr()) {
    stats.skipped++;
    return false;
  }
  const { error } = DRY_RUN || !db ? { error: null } : await db.from('events').insert(row);
  if (error) {
    stats.errors++;
    console.error(`  Ошибка вставки «${row.title.slice(0, 45)}»: ${error.message}`);
    return false;
  }
  seen.add(key);
  console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${row.title.slice(0, 60)} (${row.city}, ${row.start_date}${row.start_time ? ' ' + row.start_time.slice(0, 5) : ''}) [${row.category_id}]`);
  return true;
}

/** Общая сборка строки события из нормализованных полей источника */
async function buildRow(src) {
  let city = src.city || cityRu(`${src.venue || ''} ${src.address || ''} ${src.title || ''}`) || '';
  let lat = src.lat;
  let lng = src.lng;
  if ((lat == null || lng == null) && (src.venue || src.address)) {
    const geo = await geocode([src.venue, src.address, src.cityEn || src.city || '', 'Cyprus'].filter(Boolean).join(', '));
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    } else {
      const second = await geocode([src.venue, src.cityEn || src.city || '', 'Cyprus'].filter(Boolean).join(', '));
      if (second) {
        lat = second.lat;
        lng = second.lng;
      }
    }
  }
  // Город не определён, но координаты есть — берём ближайший крупный город Кипра
  if (!city) city = lat != null && lng != null ? nearestCity(lat, lng) : 'Лимасол';
  const center = CY_CITIES[city] || CY_CITIES[nearestCity(lat ?? 34.7, lng ?? 33.03)];
  lat = lat ?? center.lat;
  lng = lng ?? center.lng;

  const cat = (await extractCategory(src.description || src.title, src.catHint)) || src.category || 'festival';

  return {
    title: src.title,
    title_ru: src.title,
    description: src.description || '',
    description_ru: src.description || '',
    source_lang: src.lang || 'en',
    language: src.lang || 'en',
    start_date: src.start_date,
    end_date: src.end_date || null,
    start_time: src.start_time || null,
    end_time: src.end_time || null,
    city: `${city}, Кипр`,
    address: src.address || src.venue || null,
    lat,
    lng,
    category_id: cat,
    website: src.website || null,
    photos: src.photos || [],
    price: src.price ?? null,
    currency: src.currency ?? null,
    donation: false,
    country: 'cyprus',
    status: 'moderation',
  };
}

// ===== Источник 1: VisitCyprus (официальный календарь) =====
async function collectVisitCyprus(seen, budget) {
  const base = 'https://www.visitcyprus.com/wp-json/tribe/events/v1/events';
  let page = 1;
  let added = 0;
  console.log('Собираю: VisitCyprus (официальный календарь)...');
  // per_page=10: большие страницы (20/50) этот сервер отдаёт медленно и обрывает соединение
  while (page <= 20 && added < budget) {
    let data;
    try {
      data = await fetchJson(`${base}?per_page=10&page=${page}&start_date=${todayStr()}`, 90000);
    } catch (e) {
      console.error(`  VisitCyprus стр.${page}: ${e.message}`);
      break;
    }
    const events = data?.events || [];
    if (!events.length) break;
    for (const ev of events) {
      if (added >= budget) break;
      const title = decodeEntities(ev.title || '').trim();
      const start = String(ev.start_date || '').slice(0, 10);
      if (!title || !start) continue;
      if (seen.has(normKey(title, start))) {
        stats.skipped++;
        continue;
      }
      const v = ev.venue || {};
      const catNames = (ev.categories || []).map((c) => decodeEntities(c.name || '').toLowerCase());
      const category = catNames.map((n) => VC_CAT[n]).find(Boolean) || 'festival';
      const cost = parseCost(ev.cost);
      const photos = [ev.image?.url].filter(Boolean);
      const row = await buildRow({
        title,
        description: stripHtml(ev.description),
        lang: 'en',
        start_date: start,
        end_date: ev.end_date ? String(ev.end_date).slice(0, 10) : null,
        start_time: ev.all_day ? null : String(ev.start_date || '').slice(11, 16) || null,
        end_time: ev.all_day ? null : String(ev.end_date || '').slice(11, 16) || null,
        city: cityRu(v.city || '') || cityRu(`${v.venue || ''} ${v.address || ''}`) || '',
        cityEn: v.city || '',
        venue: [v.venue, v.address, v.zip].filter(Boolean).join(', '),
        address: [v.venue, v.address, v.city].filter(Boolean).join(', '),
        website: ev.website || ev.url || null,
        photos,
        price: cost.price ?? null,
        currency: cost.currency ?? null,
        category,
        catHint: `Источник: официальный календарь VisitCyprus. Категории источника: ${catNames.join(', ') || 'нет'}`,
      });
      row.source_lang = 'en';
      if (await save(row, seen)) added++;
    }
    if (page >= (data.total_pages || 1)) break;
    page++;
  }
  stats.visitcyprus = added;
  return added;
}

// ===== Источник 2: Cyprus Now (агрегатор, координаты площадок) =====
async function collectCyprusNow(seen, budget) {
  const cities = ['limassol', 'nicosia', 'larnaca', 'paphos', 'famagusta'];
  let added = 0;
  console.log('Собираю: Cyprus Now (агрегатор с координатами)...');
  for (const citySlug of cities) {
    if (added >= budget) break;
    let data;
    try {
      data = await fetchJson(`https://cyprusnow.app/api/events?city=${citySlug}`, 90000);
    } catch (e) {
      console.error(`  Cyprus Now ${citySlug}: ${e.message}`);
      continue;
    }
    const events = data?.events || [];
    console.log(`  ${citySlug}: получено ${events.length}`);
    for (const ev of events) {
      if (added >= budget) break;
      const title = decodeEntities(ev.title || ev.name || '').trim();
      const start = String(ev.start_at || ev.start_date || '').slice(0, 10);
      if (!title || !start) continue;
      if (seen.has(normKey(title, start))) {
        stats.skipped++;
        continue;
      }
      const lat = parseFloat(ev.venue_lat);
      const lng = parseFloat(ev.venue_lng);
      const priceNum = parseFloat(ev.price ?? ev.ticket_price);
      const row = await buildRow({
        title,
        description: stripHtml(ev.description || ev.excerpt || ''),
        lang: 'en',
        start_date: start,
        end_date: ev.end_at ? String(ev.end_at).slice(0, 10) : null,
        start_time: String(ev.start_at || '').slice(11, 16) || null,
        end_time: String(ev.end_at || '').slice(11, 16) || null,
        city: cityRu(ev.city || citySlug),
        cityEn: ev.city || citySlug,
        venue: ev.venue_name || ev.venue?.name || '',
        address: ev.venue_address || ev.address || ev.venue_name || ev.venue?.name || '',
        lat: Number.isFinite(lat) && Math.abs(lat) > 1 ? lat : null,
        lng: Number.isFinite(lng) && Math.abs(lng) > 1 ? lng : null,
        website: ev.url || (ev.slug ? `https://cyprusnow.app/event/${ev.slug}` : null),
        photos: [ev.image_url || ev.image || ev.cover_image].filter(Boolean),
        price: Number.isFinite(priceNum) ? priceNum : null,
        currency: Number.isFinite(priceNum) ? 'eur' : null,
        category: 'festival',
        catHint: `Источник: агрегатор Cyprus Now, город ${citySlug}. Тип: ${ev.category || ev.type || 'не указан'}`,
      });
      if (await save(row, seen)) added++;
    }
  }
  stats.cyprusnow = added;
  return added;
}

// ===== Источник 3: Cyprus.BZ (русскоязычная афиша, JSON-LD) =====
function jsonLdEvents(html) {
  const out = [];
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === 'object') {
        if (node['@type'] === 'Event') out.push(node);
        else stack.push(...Object.values(node));
      }
    }
  }
  return out;
}

async function collectCyprusBz(seen, budget) {
  let added = 0;
  console.log('Собираю: Cyprus.BZ (русскоязычная афиша)...');
  // Сайт отдаёт большие XML/HTML медленно: сначала русская карта сайта,
  // если не отдалась — английская (там те же события, ссылки /event/...).
  let sitemap = null;
  for (const name of ['sitemap-events-ru-1.xml', 'sitemap-events-1.xml']) {
    try {
      sitemap = await fetchPartial(`https://cyprus.bz/${name}`, 120000);
      break;
    } catch (e) {
      console.error(`  Cyprus.BZ ${name}: ${e.message}`);
    }
  }
  if (!sitemap) return 0;
  const thisYear = new Date().getFullYear();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => /\/event\//.test(u) && !/[?<]/.test(u))
    // в slug последним числом стоит год: события прошлых лет пропускаем
    .filter((u) => {
      const year = Number((u.match(/-(20\d{2})$/) || [])[1]);
      return !year || year >= thisYear;
    });
  console.log(`  страниц событий в sitemap: ${urls.length}`);
  for (const url of urls) {
    if (added >= budget) break;
    let ev;
    try {
      ev = jsonLdEvents(await fetchPartial(url, 60000))[0];
    } catch (e) {
      console.error(`  ${url.slice(-40)}: ${e.message}`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 400)); // вежливая пауза между страницами
    if (!ev) continue;
    const title = decodeEntities(ev.name || '').trim();
    const start = String(ev.startDate || '').slice(0, 10);
    if (!title || !start) continue;
    if (seen.has(normKey(title, start))) {
      stats.skipped++;
      continue;
    }
    const loc = ev.location || {};
    const addrLoc = loc.address?.addressLocality || '';
    const place = loc.name || '';
    const photos = (Array.isArray(ev.image) ? ev.image : [ev.image])
      .map((i) => (typeof i === 'string' ? i : i?.url))
      .filter(Boolean)
      .slice(0, 3);
    const row = await buildRow({
      title,
      description: stripHtml(ev.description || ''),
      lang: 'ru',
      start_date: start,
      end_date: ev.endDate ? String(ev.endDate).slice(0, 10) : null,
      start_time: String(ev.startDate || '').slice(11, 16) || null,
      end_time: String(ev.endDate || '').slice(11, 16) || null,
      city: cityRu(addrLoc) || cityRu(`${place} ${url}`),
      cityEn: addrLoc || '',
      venue: place,
      address: [place, addrLoc].filter(Boolean).join(', '),
      website: ev.url || url,
      photos,
      category: 'festival',
      catHint: `Источник: афиша Cyprus.BZ (русскоязычная), место: ${place}, ${addrLoc}`,
    });
    row.source_lang = 'ru';
    row.language = 'ru';
    if (await save(row, seen)) added++;
  }
  stats.cyprusbz = added;
  return added;
}

// ===== Основной цикл =====
async function main() {
  const seen = await existingKeys();
  const started = new Date();
  console.log(`Старт сбора событий Кипра${DRY_RUN ? ' (DRY_RUN)' : ''}. Уже в базе ключей: ${seen.size}`);

  // VisitCyprus отдаёт небольшой официальный календарь (~30 событий),
  // Cyprus Now — самый насыщенный источник, Cyprus.BZ добирает остаток бюджета.
  if (want('visitcyprus')) await collectVisitCyprus(seen, Math.min(60, MAX_EVENTS));
  if (want('cyprusnow')) await collectCyprusNow(seen, Math.min(80, MAX_EVENTS));
  if (want('cyprusbz')) {
    await collectCyprusBz(seen, Math.max(0, MAX_EVENTS - stats.visitcyprus - stats.cyprusnow));
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(
    `Готово: добавлено ${stats.visitcyprus + stats.cyprusnow + stats.cyprusbz} `
    + `(VisitCyprus ${stats.visitcyprus}, Cyprus Now ${stats.cyprusnow}, Cyprus.BZ ${stats.cyprusbz}), `
    + `пропущено ${stats.skipped}, ошибок ${stats.errors}, ${mins} мин.`,
  );
}

export { jsonLdEvents };

// Модуль можно импортировать (скрипты проверки) — тогда сбор не запускается.
const isDirectRun = /collect-cyprus\.mjs$/.test((process.argv[1] || '').replace(/\\/g, '/'));
if (isDirectRun) {
  main().catch((e) => {
    console.error('Критическая ошибка:', e.message);
    process.exit(1);
  });
}
