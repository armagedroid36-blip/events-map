// Недельный разведчик новых площадок и афиш для театрального сбора.
// 1) OSM Overpass: театры, арт-центры, культурные центры в радиусе 25 км от
//    центров Убуда, Улувату/Нуса-Дуа, Денпасара, Чангу, Дананга, Нячанга.
// 2) DuckDuckGo HTML: поиск по шаблонам запросов, из выдачи берутся домены,
//    которых ещё нет в реестре источников.
// 3) Фильтр LLM (DeepSeek) по паре «название + URL»: есть ли там регулярные
//    шоу/афиша для туристов; тип кандидата venue | listing | aggregator | social.
// 4) Проверка живости страницы: GET 200 и размер > 5 КБ (код ответа пишем в БД).
// 4a) Фильтр мусора (21.09.2026): кандидат, который не отдаёт 200 (в т.ч. домен
//    не резолвится), отдаёт JS-пустышку (<500 символов текста после снятия
//    тегов) или является билетной витриной (>30% внешних ссылок на
//    getyourguide/viator/klook/headout/tripadvisor/tickadoo/megatix/danaticket,
//    либо «Powered by GetYourGuide», либо partner_id= в ссылках), получает
//    status='rejected' с причиной в note и предложением в отчёт НЕ попадает.
//    Таймаут/обрыв сети приговором НЕ считается: кандидат остаётся в истории и
//    проверяется в следующем прогоне (иначе разовый сбой записал бы живой сайт
//    в rejected навсегда); «недоступен» из-за таймаута показывается в отчёте.
// 4b) Одобренный источник, который перестал отвечать или отдаёт JS-пустышку —
//    отдельной строкой в отчёте, статус НЕ меняется (решает человек).
// 5) История и антиспам: таблица public.theatre_source_candidates (RLS, только
//    service role). В Telegram уходят ТОЛЬКО кандидаты, появившиеся впервые;
//    повторный прогон в тот же день молчит. Автодобавления в реестр источников
//    НЕТ — только предложение человеку.
// 6) Живость уже одобренных источников (реестр SOURCES): три прогона подряд с
//    ошибкой — алерт в тот же чат модерации.
import { createClient } from '@supabase/supabase-js';
import { classifyTheatreSources } from './theatre-llm.mjs';
import { SOURCES } from './theatre-sources.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// IMPORT_ONLY — режим проверки фильтра снаружи: модуль импортируется, прогон не
// стартует и ключи БД не требуются (см. scripts/theatre-scout.test.mjs скилла).
const IMPORT_ONLY = process.env.THEATRE_SCOUT_IMPORT_ONLY === '1';

if (!IMPORT_ONLY && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = IMPORT_ONLY
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
// Overpass отдаёт 406 на браузерный UA — нужен честный UA приложения
const OVERPASS_UA = 'events-map-theatre-scout/1.0 (+https://mypins.site; contact: dima.armagedroid@yandex.ru)';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_CANDIDATES = Number(process.env.MAX_CANDIDATES || 40); // предохранитель: кандидатов за прогон
const MAX_QUERIES = Number(process.env.MAX_QUERIES || 12);       // предохранитель: поисковых запросов
const MIN_PAGE_BYTES = 5120;                                     // «живая» страница: 200 и > 5 КБ
const FAIL_ALERT_RUNS = 3;                                       // столько провалов подряд = алерт
// Таймауты сети: без них зависшее соединение (Overpass 504/DDG-бот-стена) останавливает
// прогон навсегда — в логе одна строка и тишина до лимита job'а.
const OVERPASS_TIMEOUT_MS = 60000;
const DDG_TIMEOUT_MS = 20000;
const PAGE_TIMEOUT_MS = 15000;
const MAX_REPORT = Number(process.env.MAX_REPORT || 15);         // строк в отчёте Telegram
const MAX_OSM_CITIES = Number(process.env.MAX_OSM_CITIES || 8);

// Центры городов для Overpass (25 км) и шаблоны поисковых запросов
const GEO = [
  { city: 'Убуд, Bali', lat: -8.5069, lng: 115.2625 },
  { city: 'Улувату, Bali', lat: -8.8293, lng: 115.0843 },
  { city: 'Денпасар, Bali', lat: -8.6705, lng: 115.2126 },
  { city: 'Чангу, Bali', lat: -8.6478, lng: 115.1385 },
  { city: 'Дананг', lat: 16.0544, lng: 108.2022 },
  { city: 'Нячанг', lat: 12.2388, lng: 109.1967 },
];

const QUERIES = [
  { city: 'Убуд, Bali', q: 'traditional dance show Ubud schedule tickets' },
  { city: 'Убуд, Bali', q: 'Balinese dance performance Ubud venue website' },
  { city: 'Нуса-Дуа, Bali', q: 'Bali theatre show Nusa Dua tickets official' },
  { city: 'Денпасар, Bali', q: 'Denpasar cultural show theatre tickets' },
  { city: 'Дананг', q: 'Da Nang theatre show tickets official' },
  { city: 'Дананг', q: 'Đà Nẵng nhà hát biểu diễn lịch diễn' },
  { city: 'Нячанг', q: 'Nha Trang theatre show tickets official' },
  { city: 'Нячанг', q: 'Nha Trang water puppet show schedule' },
  { city: 'Нячанг', q: 'Đó Theatre lịch diễn' },
  { city: 'Дананг', q: 'Hoi An traditional performance show tickets' },
  { city: 'Убуд, Bali', q: 'Ubud kecak fire dance show tickets official' },
  { city: 'Нячанг', q: 'Nha Trang circus show Vinpearl schedule' },
];

const OSM_AMENITIES = ['theatre', 'arts_centre'];
const OSM_LEISURE = ['cultural_centre'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Нормализованный ключ домена+пути (без www, схемы, хвостового слэша). */
function normUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = new URL(s);
    return `${x.host.replace(/^www\./i, '').toLowerCase()}${x.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return s.toLowerCase();
  }
}

function hostOf(u) {
  try {
    return new URL(u).host.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

const SOCIAL = /facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|t\.me|zalo\.me/i;
const AGGREGATORS = /klook\.com|trip\.com|getyourguide\.|viator\.com|tiqets\.com|bookmyshow|trazy\.com|kkday\.com|traveloka\.com|agoda\.com|booking\.com|tripadvisor\./i;
// Служебные адреса поисковика и прочий мусор выдачи — как источник не годятся
const JUNK_HOSTS = /^(html\.)?duckduckgo\.com$|^google\.com$|^bing\.com$|^yandex\./i;
// Билетные витрины (промпт Лёхи 21.09.2026): >MARKETPLACE_SHARE внешних ссылок
// ведут на них, либо «Powered by GetYourGuide», либо в ссылках есть partner_id=
// → это посредник, а не площадка с собственной афишей.
const MARKETPLACE = /getyourguide|viator\.|klook\.|headout\.|tripadvisor\.|tickadoo|megatix|danaticket/i;
const MARKETPLACE_SHARE = 0.3;
const MIN_TEXT_CHARS = 500; // меньше текста после снятия тегов = JS-пустышка

/** Текст страницы без тегов, скриптов и стилей. */
function htmlText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Признаки билетной витрины: доля внешних ссылок на маркетплейсы, «Powered by
 *  GetYourGuide», partner_id= в ссылках. Своя площадка со ссылкой на билетного
 *  партнёра (devdanbali.com — 15% таких ссылок) порог не переходит и проходит. */
function marketplaceSignals(html) {
  const links = [...String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const external = links.filter((h) => /^https?:\/\//i.test(h));
  const market = links.filter((h) => MARKETPLACE.test(h));
  return {
    share: external.length ? market.length / external.length : 0,
    market: market.length,
    external: external.length,
    poweredBy: /powered\s+by\s+getyourguide/i.test(html),
    partnerId: /partner_id=/i.test(html),
  };
}

/** GET страницы: код ответа, размер тела, длина текста и признаки витрины. */
async function checkAlive(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = res.status === 200 ? await res.text() : '';
    clearTimeout(timer);
    return {
      status: res.status,
      size: body.length || Number(res.headers.get('content-length') || 0),
      textLen: body ? htmlText(body).length : 0,
      market: body ? marketplaceSignals(body) : null,
    };
  } catch (e) {
    return { status: 0, size: 0, textLen: 0, market: null, error: e.message, code: e.cause?.code || '' };
  }
}

/** Причина автоотклонения кандидата (или null): недоступен / домен не
 *  резолвится, JS-пустышка, билетная витрина. Порядок — от грубого к тонкому.
 *  ВАЖНО: таймаут/обрыв сети — НЕ приговор: такой кандидат остаётся в истории и
 *  проверяется в следующем прогоне (иначе разовый сбой сети навсегда записал бы
 *  живой сайт в rejected). Приговор — только HTTP-код != 200 или DNS-ошибка. */
function rejectReason(alive) {
  if (!alive || alive.status !== 200) {
    if (alive?.error) {
      const dns = /getaddrinfo|ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/i.test(
        `${alive.error} ${alive.code || ''}`,
      );
      return dns ? `домен не резолвится (${alive.error})` : null;
    }
    return `ответ не 200 (код ${alive?.status ?? 0})`;
  }
  if (alive.size < MIN_PAGE_BYTES) return `страница пустая (${alive.size} б)`;
  if (alive.textLen < MIN_TEXT_CHARS) {
    return `JS-пустышка: текста после снятия тегов ${alive.textLen} симв (<${MIN_TEXT_CHARS}) — сборщик ничего не извлечёт`;
  }
  const m = alive.market;
  if (m && m.poweredBy) return 'билетная витрина: «Powered by GetYourGuide» на странице';
  if (m && m.partnerId) return 'билетная витрина: ссылки с partner_id= (партнёрская витрина)';
  if (m && m.share > MARKETPLACE_SHARE) {
    return `билетная витрина: ${m.market} из ${m.external} внешних ссылок на билетные маркетплейсы (${Math.round(m.share * 100)}% > ${Math.round(MARKETPLACE_SHARE * 100)}%)`;
  }
  return null;
}


/** Overpass: площадки вокруг центра города (перебор зеркал). */
async function overpass(lat, lng) {
  const around = `(around:25000,${lat},${lng})`;
  const parts = [
    ...OSM_AMENITIES.map((a) => `nwr["amenity"="${a}"]${around};`),
    ...OSM_LEISURE.map((l) => `nwr["leisure"="${l}"]${around};`),
    `nwr["theatre:type"]${around};`,
  ];
  const query = `[out:json][timeout:60];(${parts.join('')});out center tags;`;
  let lastErr = 'нет ответа';
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OVERPASS_UA,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      return (data.elements || [])
        .map((e) => ({
          name: e.tags?.name || e.tags?.['name:en'] || null,
          website: e.tags?.website || e.tags?.['contact:website'] || null,
          city: null,
        }))
        .filter((e) => e.name);
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(lastErr);
}

/** DuckDuckGo HTML: результаты по запросу (ссылка + заголовок).
 *  Если html-эндпоинт отдал 0 (бот-стена: из IP GitHub Actions он почти всегда
 *  пуст) — пробуем lite-эндпоинт, он отдаёт обычные ссылки. */
async function ddg(query) {
  const primary = await ddgHtml(query);
  if (primary.length) return primary;
  return ddgLite(query);
}

async function ddgHtml(query) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(DDG_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DDG HTTP ${res.status}`);
  const html = await res.text();
  const out = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    let href = m[1];
    const u = href.match(/[?&]uddg=([^&]+)/);
    if (u) href = decodeURIComponent(u[1]);
    const title = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    out.push({ url: href, name: title });
  }
  return out;
}

async function ddgLite(query) {
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
    signal: AbortSignal.timeout(DDG_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DDG lite HTTP ${res.status}`);
  const html = await res.text();
  const out = [];
  const re = /<a[^>]+class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    let href = m[1].replace(/&amp;/g, '&');
    const u = href.match(/[?&]uddg=([^&]+)/);
    if (u) href = decodeURIComponent(u[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    const title = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    out.push({ url: href, name: title });
  }
  return out;
}

/** Название источника с сайта (title), если LLM/поиск не дали осмысленного. */
async function pageTitle(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 120) : null;
  } catch {
    return null;
  }
}

async function sendTelegram(text, chatId) {
  if (!TG_TOKEN) {
    console.warn('Telegram пропущен: TELEGRAM_BOT_TOKEN не задан');
    return false;
  }
  if (!chatId) {
    console.warn('Telegram пропущен: notify_chat_id не задан в app_settings');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram API: ${JSON.stringify(json)}`);
  return true;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function main() {
  const knownUrls = new Set(SOURCES.map((s) => normUrl(s.url)));
  const knownHosts = new Set(SOURCES.map((s) => hostOf(s.url)));

  // ---------- 1. Сбор кандидатов ----------
  const raw = [];
  for (const g of GEO.slice(0, MAX_OSM_CITIES)) {
    try {
      const items = await overpass(g.lat, g.lng);
      const withSite = items.filter((i) => i.website).length;
      console.log(`Overpass ${g.city}: площадок ${items.length}, из них с сайтом ${withSite}`);
      for (const it of items) raw.push({ ...it, city: g.city, origin: 'osm' });
    } catch (e) {
      console.error(`Overpass ${g.city}: ${e.message}`);
    }
    await sleep(2000); // лимит Overpass
  }

  for (const q of QUERIES.slice(0, MAX_QUERIES)) {
    try {
      const items = await ddg(q.q);
      console.log(`DuckDuckGo «${q.q}»: ${items.length} результатов`);
      for (const it of items) raw.push({ ...it, city: q.city, origin: 'ddg' });
    } catch (e) {
      console.error(`DuckDuckGo «${q.q}»: ${e.message}`);
    }
    await sleep(2500); // вежливость к html.duckduckgo.com
  }

  // URL: сайт площадки, иначе ссылка из выдачи; дедуп по нормализованному URL
  const seen = new Set();
  const candidates = [];
  const hostTaken = new Set(knownHosts); // один кандидат на домен; известные домены пропускаем
  for (const r of raw) {
    let url = r.website || r.url;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    url = url.split('#')[0].split('?')[0];
    const n = normUrl(url);
    if (!n || seen.has(n)) continue;
    if (knownUrls.has(n)) continue;             // уже в реестре источников
    if (JUNK_HOSTS.test(hostOf(url))) continue; // служебные ссылки поисковика
    const h = hostOf(url);
    if (hostTaken.has(h)) continue;             // домен уже предложен/одобрен
    if (SOCIAL.test(url) && !r.website) continue; // соцсеть как основной источник — мимо
    seen.add(n);
    hostTaken.add(h);
    candidates.push({ name: r.name || null, url, city: r.city, origin: r.origin });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  console.log(`Кандидатов после дедупа (по доменам): ${candidates.length}`);

  // ---------- 2. Фильтр LLM ----------
  const verdicts = new Map();
  for (let i = 0; i < candidates.length; i += 15) {
    const batch = candidates.slice(i, i + 15);
    try {
      const res = await classifyTheatreSources(batch.map((c) => ({ name: c.name, url: c.url, city: c.city })));
      for (const v of res) verdicts.set(i + v.index, v);
    } catch (e) {
      console.error(`Фильтр LLM (пачка ${i / 15 + 1}): ${e.message}`);
    }
  }

  const filtered = [];
  const llmRejected = []; // отклонённые LLM тоже фиксируем в таблице (см. ниже)
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const v = verdicts.get(i);
    // тип: соцсеть/агрегатор определяем по домену, остальное — вердикт LLM
    const kind = SOCIAL.test(c.url) ? 'social' : AGGREGATORS.test(c.url) ? 'aggregator' : v?.kind || 'listing';
    const relevant = v ? v.relevant : false;
    // агрегатор пропускаем только если это действительно агрегатор билетов
    const pass = relevant || (kind === 'aggregator' && AGGREGATORS.test(c.url));
    if (!pass) {
      console.log(`  × отклонён: ${c.url} (${v?.reason || 'нет вердикта LLM'})`);
      llmRejected.push({ ...c, kind, reason: v?.reason || 'нет вердикта LLM' });
      continue;
    }
    filtered.push({ ...c, kind, reason: v?.reason || '' });
  }
  console.log(`Прошли фильтр LLM: ${filtered.length}, отклонено LLM: ${llmRejected.length}`);


  // ---------- 3. Проверка живости + запись в БД ----------
  const nowIso = new Date().toISOString();
  const fresh = [];
  const autoRejected = [];
  /** Записать кандидата как rejected. Прежнюю заметку (её мог написать человек
   *  при разборе бэклога) СОХРАНЯЕМ: дописываем свежую машинную причину вместо
   *  прошлой машинной — повторные прогоны не должны терять человеческую запись
   *  и не должны бесконечно удлинять note. */
  const setRejected = async (url, { name, city, kind, reason }) => {
    if (DRY_RUN) return;
    const { data: prev } = await db
      .from('theatre_source_candidates')
      .select('note,first_seen')
      .eq('url', url)
      .maybeSingle();
    const prevNote = typeof prev?.note === 'string' ? prev.note.trim() : '';
    const head = prevNote.split(/\s*\|\s*автоотклонение/i)[0].trim();
    const note = `${head ? `${head} | ` : ''}автоотклонение: ${reason}`;
    const { error } = await db.from('theatre_source_candidates').upsert(
      {
        url,
        name,
        city: city || null,
        kind,
        status: 'rejected',
        first_seen: prev ? undefined : nowIso,
        last_seen: nowIso,
        note: note.slice(0, 500),
      },
      { onConflict: 'url' },
    );
    if (error) console.error(`БД (отклонение ${url}): ${error.message}`);
  };
  for (const c of filtered) {
    const { data: prev, error: pe } = await db
      .from('theatre_source_candidates')
      .select('url,status,name,note')
      .eq('url', c.url)
      .maybeSingle();
    if (pe) {
      console.error(`БД (чтение кандидата ${c.url}): ${pe.message}`);
      continue;
    }
    const alive = await checkAlive(c.url);
    const okAlive = alive.status === 200 && alive.size > MIN_PAGE_BYTES;
    const name = c.name || (okAlive ? await pageTitle(c.url) : null) || hostOf(c.url);

    // Автоотклонение мусора (промпт Лёхи 21.09.2026): отдаёт не 200 / домен не
    // резолвится, JS-пустышка или билетная витрина. Такие кандидаты в Telegram
    // НЕ попадают, а в таблице получают status='rejected' с причиной — значит,
    // повторно не предлагаются. Уже одобренный источник не понижаем.
    const bad = rejectReason(alive);
    if (bad) {
      console.log(`  ✗ автоотклонён: ${c.url} — ${bad}`);
      autoRejected.push({ url: c.url, reason: bad });
      if (prev?.status !== 'approved') {
        await setRejected(c.url, { name, city: c.city, kind: c.kind, reason: bad });
      }
      await sleep(300);
      continue;
    }

    const status = prev?.status || 'proposed';
    const note = `${c.city || ''} | ${c.kind} | код ${alive.status}, ${alive.size} б | ${c.reason}`.slice(0, 500);

    if (!DRY_RUN) {
      const { error: ue } = await db.from('theatre_source_candidates').upsert(
        { url: c.url, name, city: c.city || null, kind: c.kind, status, first_seen: prev ? undefined : nowIso, last_seen: nowIso, note },
        { onConflict: 'url' },
      );
      if (ue) console.error(`БД (запись ${c.url}): ${ue.message}`);
    }
    if (!prev) {
      fresh.push({ ...c, name, statusCode: alive.status, size: alive.size, alive: okAlive });
    } else {
      console.log(`  = уже в истории: ${c.url} (${status})`);
    }
    await sleep(300);
  }

  // Отклонённые LLM тоже попадают в таблицу со статусом rejected: иначе их
  // предложат снова в следующем прогоне (ТЗ: rejected = «не предлагать повторно»).
  let llmRejectedNew = 0;
  for (const c of llmRejected) {
    const { data: prev, error } = await db
      .from('theatre_source_candidates')
      .select('url,status')
      .eq('url', c.url)
      .maybeSingle();
    if (error) {
      console.error(`БД (чтение ${c.url}): ${error.message}`);
      continue;
    }
    if (prev) continue; // уже в истории (в т.ч. одобренные) — не трогаем
    llmRejectedNew += 1;
    await setRejected(c.url, {
      name: c.name || hostOf(c.url),
      city: c.city,
      kind: c.kind,
      reason: `LLM не видит регулярных шоу — ${c.reason}`,
    });
    console.log(`  ✗ записан как rejected (LLM): ${c.url} — ${c.reason}`);
    await sleep(150);
  }
  console.log(`Новых записей со статусом rejected: LLM ${llmRejectedNew}, автоотклонено мусора ${autoRejected.length}`);

  // ---------- 4. Живость уже одобренных источников ----------
  const alerts = [];
  const degraded = []; // перестал отвечать/JS-пустышка — статус не меняем, решает человек
  for (const s of SOURCES) {
    const alive = await checkAlive(s.url);
    const okAlive = alive.status === 200 && alive.size > MIN_PAGE_BYTES;
    const { data: prev } = await db
      .from('theatre_source_candidates')
      .select('url,note')
      .eq('url', s.url)
      .maybeSingle();
    // Счётчик провалов живёт в note (схема таблицы фиксирована ТЗ)
    const prevFails = Number((String(prev?.note || '').match(/fails=(\d+)/) || [])[1] || 0);
    const fails = okAlive ? 0 : prevFails + 1;
    if (!DRY_RUN) {
      const { error } = await db.from('theatre_source_candidates').upsert(
        {
          url: s.url,
          name: s.name,
          city: s.city,
          kind: s.kind,
          status: 'approved',
          first_seen: prev ? undefined : nowIso,
          last_seen: nowIso,
          note: `fails=${fails}; живость: код ${alive.status}, ${alive.size} б, текста ${alive.textLen} симв`,
        },
        { onConflict: 'url' },
      );
      if (error) console.error(`БД (источник ${s.url}): ${error.message}`);
    }
    const bad = okAlive
      ? rejectReason(alive)
      : `недоступен (код ${alive.status}${alive.error ? `, ${alive.error}` : ''})`;
    if (bad) degraded.push(`${s.name}: ${bad}`);
    console.log(
      `  ${okAlive ? '✓' : '✗'} ${s.name}: код ${alive.status}, ${alive.size} б, провалов подряд ${fails}${bad ? ` — ${bad}` : ''}`,
    );
    if (fails >= FAIL_ALERT_RUNS) alerts.push(`${s.name} — код ${alive.status}, провалов подряд ${fails}`);
  }

  // ---------- 5. Отчёт в Telegram (только новое) ----------
  if (!fresh.length && !alerts.length && !degraded.length) {
    console.log('Новых кандидатов и алертов нет — отчёт не отправляем');
    return;
  }

  // Порядок в отчёте: живые площадки и афиши важнее агрегаторов, мёртвые — в конце
  const weight = (c) => (c.alive ? 0 : 10) + (c.kind === 'venue' ? 0 : c.kind === 'listing' ? 1 : c.kind === 'aggregator' ? 2 : 3);
  const sorted = [...fresh].sort((a, b) => weight(a) - weight(b));
  const shown = sorted.slice(0, MAX_REPORT);

  const lines = [`🔎 Разведка театральных площадок: новых кандидатов ${fresh.length}`];
  for (const c of shown) {
    const rec =
      c.kind === 'social'
        ? 'соцсеть — только как подсказка'
        : c.kind === 'aggregator'
          ? 'агрегатор билетов — только как подсказка'
          : !c.alive
            ? 'недоступна сейчас — проверить вручную'
            : 'взять основным источником';
    lines.push(
      `• ${esc(c.name)}\n  ${esc(c.city || '')} · ${c.kind}\n  ${esc(c.url)}\n  код ${c.statusCode}, ${Math.round(c.size / 1024)} КБ → ${rec}`,
    );
  }
  if (sorted.length > shown.length) lines.push(`…и ещё ${sorted.length - shown.length} — в таблице theatre_source_candidates`);
  if (autoRejected.length) {
    lines.push(
      `🧹 Автоотклонено ${autoRejected.length} (недоступные, JS-пустышки, билетные витрины) — в базе rejected, повторно не предлагаются:\n${autoRejected
        .slice(0, 5)
        .map((a) => `• ${esc(a.url)}\n  ${esc(a.reason)}`)
        .join('\n')}${autoRejected.length > 5 ? `\n…и ещё ${autoRejected.length - 5}` : ''}`,
    );
  }
  if (degraded.length) {
    lines.push(
      `⚠️ Одобренные источники (статус не меняем, решает человек):\n${degraded.map((d) => `• ${esc(d)}`).join('\n')}`,
    );
  }
  if (alerts.length) lines.push(`⚠️ Упали одобренные источники:\n${alerts.map((a) => `• ${esc(a)}`).join('\n')}`);

  const { data: settingsRows } = await db.from('app_settings').select('key,value');
  const settings = {};
  for (const r of settingsRows || []) settings[r.key] = r.value;
  if (!DRY_RUN) {
    try {
      const sent = await sendTelegram(lines.join('\n'), settings.notify_chat_id);
      if (sent) console.log('Telegram: отчёт отправлен');
      else console.error('Telegram: отчёт НЕ отправлен');
    } catch (e) {
      console.error('Telegram ошибка:', e.message);
      process.exitCode = 1;
    }
  } else {
    console.log('[dry] отчёт:\n' + lines.join('\n'));
  }
}

// Экспорт чистых функций фильтра: их проверяет scripts/theatre-scout.test.mjs
// (запуск с THEATRE_SCOUT_IMPORT_ONLY=1, чтобы импорт не стартовал прогон).
export { rejectReason, marketplaceSignals, htmlText };

if (!IMPORT_ONLY) {
  main().catch((e) => {
    console.error('Критическая ошибка:', e.message);
    process.exit(1);
  });
}
