// Сборщик анонсов из Telegram-ГРУПП (не каналов) через бота Bot API.
//
// Зачем отдельный файл: t.me/s/<username> отдаёт ленту только для КАНАЛОВ. У групп
// веб-ленты нет (редирект на профиль), поэтому collect-tg.mjs их взять не может.
// Официальный путь — бот, добавленный в группу: getUpdates отдаёт сообщения.
//
// Что делает:
// 1. getUpdates с offset из app_settings (как feedback-bot.mjs), allowed_updates=["message"];
// 2. фильтр: только сообщения из групп GROUPS, есть text/caption;
// 3. мусор в карточки не превращаем: сообщение обязано содержать дату и сигналы
//    события (время/адрес/цену/словарное слово) — иначе пропуск;
// 4. поля извлекаются теми же модулями, что в collect-tg.mjs (импорт, не копия);
// 5. дедуп: ссылка поста https://t.me/<username>/<id> уже есть в events.website;
// 6. карточки вставляются со status='moderation' (публикация — автопроверка модерации).
//
// Токен в лог не попадает; тексты постов не печатаем (в них бывают контакты).
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { extractDateLLM } from './date-llm.mjs';
import { extractTime } from './time-llm.mjs';
import { extractPrice } from './price-llm.mjs';
import { extractCategory } from './category-llm.mjs';
import { extractAddressLLM } from './address-llm.mjs';
import { extractAddress } from './address-regex.mjs';
import { cleanAddress, isCityAddress } from './address-junk.mjs';
import { cleanCardText } from './text-safe.mjs';
import { extractContacts } from './contacts-regex.mjs';
import { findCityZone } from './city-zones.mjs';
import { cleanEndTime } from './end-time-guard.mjs';
import { cityForPoint } from './cy-districts.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BOT_TOKEN = process.env.TELEGRAM_READER_BOT_TOKEN;
// Оффлайн-прогон на фикстуре (JSON-массив апдейтов) — для проверки парсинга без бота.
const FIXTURE = process.env.TG_UPDATES_FIXTURE || '';
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_CARDS = Number(process.env.MAX_CARDS || 40);

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}
if (!BOT_TOKEN && !FIXTURE) {
  // Токен не печатаем ни при каких условиях.
  console.error('Нужна переменная TELEGRAM_READER_BOT_TOKEN (или TG_UPDATES_FIXTURE для оффлайн-прогона)');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;
// Единый ключ смещения: update_id в getUpdates общий для всех чатов бота,
// поэтому «свой offset на каждый chat_id» невозможен — смещение одно.
const OFFSET_KEY = 'tg_group_offset';

// Группы-источники. username — ключ сопоставления апдейта с источником (chat.username).
const GROUPS = [
  {
    username: 'boardgames_cy',
    title: 'Boardgames_CY',
    kind: 'cyprus',              // город определяем по адресу/тексту
    country: 'CY',
    tzMin: 180,                  // UTC+3 (EEST)
  },
  {
    username: 'ggcafenhatrang',
    title: 'GGcafeNhaTrang',
    kind: 'vietnam',
    city: 'Нячанг',
    cityEn: 'Nha Trang',
    country: 'VN',
    tzMin: 420,                  // UTC+7
    fallback: { lat: 12.2388, lng: 109.1967 }, // центр Нячанга (как в collect-tg CHANNELS)
  },
];
const BY_USERNAME = new Map(GROUPS.map((g) => [g.username, g]));

// ===== Telegram API =====
async function tg(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err = new Error(`Telegram ${method}: ${json.error_code || res.status} ${json.description || ''}`.trim());
    err.code = json.error_code;
    throw err;
  }
  return json.result;
}

/** Смещение из app_settings */
async function readOffset() {
  const { data, error } = await db.from('app_settings').select('value').eq('key', OFFSET_KEY).maybeSingle();
  if (error) throw error;
  const n = Number(data?.value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function saveOffset(offset) {
  if (DRY_RUN) return;
  const { error } = await db
    .from('app_settings')
    .upsert({ key: OFFSET_KEY, value: String(offset) }, { onConflict: 'key' });
  if (error) throw error;
}

/** getUpdates и webhook несовместимы: при заданном webhook вернётся 409 Conflict. */
async function ensurePolling() {
  try {
    const info = await tg('getWebhookInfo');
    if (info?.url) {
      await tg('deleteWebhook', { drop_pending_updates: false });
      console.log('Снят вебхук бота (getUpdates работает только без него)');
    }
  } catch (e) {
    console.warn(`getWebhookInfo: ${e.message}`);
  }
}

// ===== Мелочи разбора =====
const DATE_HINT = /(\d{1,2}\s*[./]\s*\d{1,2})|(\d{1,2}\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр))|(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)|(понедельник|вторник|сред[ауы]|четверг|пятниц|суббот|воскресень)|(сегодня|завтра|послезавтра)|\d{1,2}:\d{2}/i;
const EVENT_WORDS = /(настолк|настольн|board\s*games?|boardgame|tabletop|игротек|игр[аыуе]|играем|game\s*night|квиз|quiz|мафия|турнир|tournament|встреч|meet\s*up|meetup|приглаша|регистрац|запис[ьа]|билет|вход|бесплатн|free\s*entry|кафе|cafe|вечеринк|party|лекци|мастер|workshop|концерт|live\s*music|джем|сообществ|community|клуб|club|йога|yoga|кино|movie|screening|event|ивент|мероприят)/i;
const MONTH_KEYS = [
  ['янв', 1], ['фев', 2], ['мар', 3], ['апр', 4], ['май', 5], ['мая', 5],
  ['июн', 6], ['июл', 7], ['авг', 8], ['сен', 9], ['окт', 10], ['ноя', 11], ['дек', 12],
];
const WEEKDAY_KEYS = [
  ['понедельник', 1], ['вторник', 2], ['сред', 3], ['четверг', 4],
  ['пятниц', 5], ['суббот', 6], ['воскресен', 7],
];

function monthNum(word) {
  const w = String(word || '').toLowerCase();
  for (const [key, num] of MONTH_KEYS) if (w.startsWith(key)) return num;
  return null;
}

function weekdayNum(word) {
  const w = String(word || '').toLowerCase().replace(/[ауеяы]$/u, '');
  for (const [key, num] of WEEKDAY_KEYS) if (w.startsWith(key)) return num;
  return null;
}

function todayInTz(tzMin, now = Date.now()) {
  const d = new Date(now + tzMin * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Локальный разбор даты (дёшево, без LLM) — резерв, если LLM недоступен. */
function parseDateRegex(text, tzMin) {
  const now = Date.now();
  const today = todayInTz(tzMin, now);
  const base = new Date(`${today}T00:00:00Z`);
  const iso = (d) => d.toISOString().slice(0, 10);

  const m1 = text.match(/(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i);
  if (m1) {
    const day = +m1[1];
    const month = monthNum(m1[2]);
    if (month && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), month - 1, day));
      if (d >= base) return iso(d);
      const next = new Date(Date.UTC(base.getUTCFullYear() + 1, month - 1, day));
      if (next - base < 120 * 86400000) return iso(next);
    }
  }

  const m2 = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m2) {
    const day = +m2[1];
    const month = +m2[2];
    let year = m2[3] ? (m2[3].length === 2 ? 2000 + +m2[3] : +m2[3]) : base.getUTCFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let d = new Date(Date.UTC(year, month - 1, day));
      if (!m2[3] && d < base) d = new Date(Date.UTC(year + 1, month - 1, day));
      return iso(d);
    }
  }

  const m3 = text.match(/(понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресень[ея])/i);
  if (m3) {
    const wd = weekdayNum(m3[1]);
    if (wd) {
      const cur = base.getUTCDay() || 7;
      let diff = wd - cur;
      if (diff < 0) diff += 7;
      if (diff === 0) diff = 7; // анонс всегда в будущее
      return iso(new Date(base.getTime() + diff * 86400000));
    }
  }
  return null;
}

/** Время HH:MM из текста (резерв, если LLM недоступен) */
function parseTimeRegex(text) {
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** Цена из текста (резерв): «200k», «250 000 VND», «5€», «10$», «бесплатно» */
function parsePriceRegex(text) {
  if (/(бесплатн|free\s*(entry|of charge)|вход\s+свободн)/i.test(text)) {
    return { price: 0, currency: null, free: true, donation: false };
  }
  const m = text.match(/(\d[\d\s.,]{0,8})\s*(k|тыс\.?|₫|vnd|đ|usd|\$|€|eur|руб)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/\s/g, '').replace(/,/g, (s, i, str) => (/,\d{1,2}$/.test(str) ? '.' : '')));
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit === 'k' || unit === 'тыс' || unit === 'тыс.') n *= 1000;
  const currency = unit === '$' || unit === 'usd' ? 'USD'
    : unit === '€' || unit === 'eur' ? 'EUR'
      : unit === 'руб' ? 'RUB'
        : unit === '₫' || unit === 'đ' || unit === 'vnd' ? 'VND' : null;
  return { price: n, currency, free: false, donation: false };
}

/** Название: первая содержательная строка без эмодзи и служебных ярлыков */
const GREETING = /^(всем\s+привет|привет|здравствуй(те)?|добрый\s+(день|вечер)|доброе\s+утро|друзья|дорогие\s+\S+|уважаемые\s+\S+|внимание|анонс|афиша|hello(\s+guys)?|hi(\s+guys)?|good\s+(morning|evening))[!,.…:)\-\s]*$/iu;
const SERVICE_LINE = /^(дата|когда|время|начало|где|место|адрес|стоимость|цена|вход|билеты|контакты|запись|телефон|канал|подпис|регистрац|участие)\s*[:：]/iu;

function extractTitle(text) {
  const clean = (s) => s
    .replace(/[^\p{L}\p{N}\s.,!?«»"':()\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cand = clean(line).replace(/^(приглашаю|приглашаем)\s+(вас\s+)?(на|в)\s+/iu, '').trim();
    if (!cand || GREETING.test(cand) || SERVICE_LINE.test(cand)) continue;
    if (cand.length < 8) continue;
    return cand.slice(0, 120);
  }
  const first = lines.map(clean).find((l) => l.length >= 4);
  return (first || 'Событие').slice(0, 120);
}

/** Язык по письменности: кириллица → ru, греческий → el, иначе en */
function detectLang(text) {
  const s = String(text || '');
  if (/[\u0370-\u03ff\u1f00-\u1fff]/.test(s)) return 'el';
  if (/[а-яё]/i.test(s)) return 'ru';
  return 'en';
}

// ===== Геокодинг (Nominatim, 1 запрос/сек, с кэшем) =====
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const geoCache = new Map();
let lastGeo = 0;

async function nominatim(query, rejectNear) {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = Math.max(0, 1100 - (Date.now() - lastGeo));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  let out = null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        const near = rejectNear && (lat - rejectNear.lat) ** 2 + (lng - rejectNear.lng) ** 2 < 0.01 ** 2;
        if (!near) out = { lat, lng };
      }
    }
  } catch {
    out = null;
  }
  geoCache.set(key, out);
  return out;
}

// ===== Кипр: метка города =====
// Названия округов/городов в тексте — чтобы дать ЧЕСТНУЮ метку, когда адрес
// не геокодировался (координаты в этом случае не выдумываем).
const CY_TEXT_CITIES = [
  [/ая[-\s]?нап|ayia\s*napa|agia\s*napa|αγία\s*ναπα/i, 'Ая-Напа'],
  [/протарас|protaras|πρωταράς/i, 'Протарас'],
  [/паралимни|paralimni|παραλίμνι/i, 'Паралимни'],
  [/лимасол|лимассол|limassol|lemesos|λεμεσός/i, 'Лимасол'],
  [/никоси|lefkosia|nicosia|λευκωσία/i, 'Никосия'],
  [/ларнак|лернак|larnaca|larnaka|λάρνακα/i, 'Ларнака'],
  [/пафос|paphos|pafos|πάφος/i, 'Пафос'],
  [/фамагуст|famagusta|αμμόχωστος/i, 'Фамагуста'],
  [/полис\s+хрисохус|polis\s+chrysochous/i, 'Полис'],
];

function cyCityFromText(text) {
  const s = String(text || '');
  for (const [re, name] of CY_TEXT_CITIES) if (re.test(s)) return name;
  return null;
}

function cyLabel(lat, lng) {
  const name = cityForPoint(lat, lng);
  return name ? (/кипр/i.test(name) ? name : `${name}, Кипр`) : null;
}

/**
 * Гео для карточки Кипра: сначала честный геокодинг адреса, затем метка по точке,
 * иначе метка по тексту, иначе 'Кипр' без координат.
 */
async function resolveCyprusGeo(address, text, hintCity) {
  const queries = [];
  if (address) queries.push(`${address}, Cyprus`);
  if (hintCity && hintCity !== address) queries.push(`${hintCity}, Cyprus`);
  for (const q of queries) {
    const g = await nominatim(q);
    if (g) {
      const label = cyLabel(g.lat, g.lng);
      return { lat: g.lat, lng: g.lng, city: label || 'Кипр', address, source: 'geocode' };
    }
  }
  const fromText = cyCityFromText(text);
  if (fromText) return { lat: null, lng: null, city: `${fromText}, Кипр`, address, source: 'text' };
  return { lat: null, lng: null, city: 'Кипр', address, source: 'none' };
}

/** Гео для Нячанга: геокод адреса → зона города → центр города (как collect-tg). */
async function resolveVnGeo(group, address, text) {
  if (address) {
    // Нячанг по-русски Nominatim часто не находит — пробуем и латиницу города.
    const cities = [group.cityEn, group.city].filter(Boolean);
    const variants = [address];
    const short = address.split(',').slice(1).join(', ').trim();
    if (short) variants.push(short); // без названия заведения
    for (const v of variants) {
      for (const city of cities) {
        const g = await nominatim(`${v}, ${city}, Vietnam`, group.fallback);
        if (g) return { lat: g.lat, lng: g.lng, city: group.city, source: 'geocode' };
      }
    }
  }
  const zone = findCityZone(group.city, `${address || ''} ${text}`);
  if (zone) return { lat: zone.lat, lng: zone.lng, city: group.city, source: `зона:${zone.zone}` };
  return { lat: group.fallback.lat, lng: group.fallback.lng, city: group.city, source: 'центр города' };
}

// ===== Фото =====
/**
 * Фото сообщения → публичный бакет 'photos'.
 * Прямую ссылку Bot API в photos класть нельзя: в ней лежит токен бота
 * (https://api.telegram.org/file/bot<token>/...), а photos уходят на сайт.
 */
async function uploadPhoto(fileId, username, messageId, index) {
  if (DRY_RUN || FIXTURE || !API) return null;
  try {
    const file = await tg('getFile', { file_id: fileId });
    if (!file?.file_path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (file.file_path.match(/\.(\w+)$/)?.[1] || 'jpg').toLowerCase();
    const path = `tg/${username}/${messageId}-${index}.${ext}`;
    const { error } = await db.storage.from('photos').upload(path, buf, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
      cacheControl: '86400',
    });
    if (error) {
      console.warn(`  фото ${username}/${messageId}: ${error.message}`);
      return null;
    }
    return path;
  } catch (e) {
    console.warn(`  фото ${username}/${messageId}: ${e.message}`);
    return null;
  }
}

// ===== Дедупликация =====
/** Уже собранные карточки: множество website (ссылка на пост) + ключи title|дата */
async function existingState() {
  let rows;
  try {
    rows = await selectAll(db, 'events', 'id, title, start_date, website');
  } catch (e) {
    // Пустой набор ключей означал бы повторную вставку всей ленты — лучше упасть.
    throw new Error(`не удалось прочитать ключи дублей: ${e.message}`);
  }
  const websites = new Set();
  const keys = new Set();
  for (const r of rows || []) {
    const w = String(r.website || '').trim().toLowerCase().replace(/\/+$/, '');
    if (w) websites.add(w);
    if (r.title && r.start_date) keys.add(`${String(r.title).trim().toLowerCase()}|${r.start_date}`);
  }
  return { websites, keys, total: (rows || []).length };
}

function postUrl(username, messageId) {
  return `https://t.me/${username}/${messageId}`;
}

// ===== Обработка одного сообщения =====
async function handleMessage(msg, group, state, stats) {
  const text = String(msg.text || msg.caption || '').trim();
  const messageId = msg.message_id;
  if (!text) return;
  if (text.startsWith('/')) return; // команды

  const website = postUrl(group.username, messageId);
  const wKey = website.toLowerCase();
  if (state.websites.has(wKey)) {
    stats.dupes++;
    return;
  }

  // Мусор: без намёка на дату или без признаков события не рассматриваем вовсе
  // (болтовня в группах — основной объём апдейтов).
  if (!DATE_HINT.test(text)) {
    stats.noDate++;
    return;
  }

  const tzMin = group.tzMin;
  const today = todayInTz(tzMin);

  // Дата: LLM понимает «в следующую пятницу», «29 сентября в 19:00»; regex — резерв.
  let startDate = null;
  let llmTime = null;
  try {
    const llm = await extractDateLLM(text, tzMin);
    if (llm?.start_date) {
      startDate = llm.start_date;
      llmTime = { start_time: llm.start_time || null, end_time: llm.end_time || null };
    }
  } catch {
    /* LLM недоступен — ниже сработает regex */
  }
  if (!startDate) startDate = parseDateRegex(text, tzMin);
  if (!startDate) {
    stats.noDate++;
    return;
  }
  if (startDate < today) {
    stats.past++;
    return;
  }

  // Время/адрес/цена/категория — те же модули, что в collect-tg.mjs
  let time = llmTime?.start_time || null;
  let timeEnd = llmTime?.end_time || null;
  try {
    const t = await extractTime(text);
    if (!time && t?.start_time) time = t.start_time;
    if (!timeEnd && t?.end_time) timeEnd = t.end_time;
  } catch { /* ниже regex */ }
  if (!time) time = parseTimeRegex(text);

  let address = null;
  try {
    const llmAddr = await extractAddressLLM(text, group.kind === 'vietnam' ? group.city : 'Кипр');
    address = cleanAddress(llmAddr?.address) || null;
  } catch { /* ниже regex */ }
  if (!address) address = extractAddress(text, group.kind === 'vietnam' ? group.city : 'Кипр') || null;
  if (address && group.kind === 'vietnam' && isCityAddress(address, group.city)) address = null;
  if (address && /^кипр$/i.test(address)) address = null;

  let price = null;
  try {
    price = await extractPrice(text, group.kind === 'vietnam' ? group.city : undefined);
  } catch { /* ниже regex */ }
  if (!price) {
    price = parsePriceRegex(text);
  } else if (!price.currency) {
    // LLM вернул сумму без валюты — берём валюту из regex («5€», «200k»).
    const rx = parsePriceRegex(text);
    if (rx?.currency) price.currency = rx.currency;
  }

  // Сигналы события. Дата уже есть — этого мало: в группах идёт болтовня
  // («в пятницу играем, кто с нами?»). Карточку создаём только если есть
  // МЕСТО (адрес/площадка) либо внятный план (время + слово события + текст).
  const hasPlace = !!address;
  const hasPlan = !!time && EVENT_WORDS.test(text) && text.length >= 60;
  if (!hasPlace && !hasPlan) {
    stats.garbage++;
    return;
  }

  let category = null;
  try {
    category = await extractCategory(text, group.kind === 'vietnam' ? group.city : 'Кипр');
  } catch { /* default ниже */ }
  category = category || 'games'; // группы настолок: дефолт games

  const title = cleanCardText(extractTitle(text));
  if (!title) {
    stats.garbage++;
    return;
  }
  const titleKey = `${title.trim().toLowerCase()}|${startDate}`;
  if (state.keys.has(titleKey)) {
    stats.dupes++;
    return;
  }

  // Гео
  let geo;
  if (group.kind === 'vietnam') {
    geo = await resolveVnGeo(group, address, text);
  } else {
    geo = await resolveCyprusGeo(address, text, cyCityFromText(text));
  }

  // Фото: последний (самый крупный) размер; максимум 3
  const photos = [];
  const sizes = Array.isArray(msg.photo) ? [msg.photo[msg.photo.length - 1]] : [];
  for (let i = 0; i < sizes.length && photos.length < 3; i++) {
    const p = await uploadPhoto(sizes[i].file_id, group.username, messageId, i);
    if (p) photos.push(p);
  }

  const contacts = extractContacts(text, []);
  const lang = detectLang(text);
  const desc = cleanCardText(text).slice(0, 3000);

  const row = {
    title,
    title_ru: lang === 'ru' ? title : null, // перевод дозаполнит backfill-translations
    description: desc,
    description_ru: lang === 'ru' ? desc : null,
    source_lang: lang,
    language: lang,
    start_date: startDate,
    end_date: null,
    start_time: time || null,
    end_time: cleanEndTime({ start_date: startDate, start_time: time, end_date: null, end_time: timeEnd }),
    city: geo.city,
    address,
    lat: geo.lat,
    lng: geo.lng,
    category_id: category,
    website,
    contact_telegram: contacts.telegram || null,
    contact_whatsapp: contacts.whatsapp || null,
    contact_phone: contacts.phone || null,
    contact_email: contacts.email || null,
    contact_instagram: contacts.instagram || null,
    photos,
    price: price?.free ? 0 : (price?.price ?? null),
    currency: price?.currency ?? null,
    donation: !!price?.donation,
    status: 'moderation',
    source_type: 'collector',
  };

  if (!DRY_RUN) {
    const { error } = await db.from('events').insert(row);
    if (error) {
      stats.errors++;
      console.error(`  ошибка вставки ${group.username}/${messageId}: ${error.message}`);
      return;
    }
  }
  state.websites.add(wKey);
  state.keys.add(titleKey);
  stats.created++;
  // Тексты постов не печатаем (контакты), только идентификаторы и поля карточки.
  console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${group.username}/${messageId} | ${startDate}${time ? ' ' + time : ''} | ${geo.city} | ${category} | гео: ${geo.source}${address ? ' | адрес есть' : ''}`);
  // На фикстуре — полный дамп строки (текст синтетический), чтобы видеть координаты,
  // фото и поля карточки при проверке парсинга без бота.
  if (FIXTURE) {
    const dump = { ...row, description: row.description ? `<${row.description.length} симв.>` : null, description_ru: undefined };
    console.log(`    ${JSON.stringify(dump)}`);
  }
}

async function main() {
  const stats = { updates: 0, ours: 0, dupes: 0, noDate: 0, past: 0, garbage: 0, created: 0, errors: 0 };

  // Смещение читаем ДО запроса: сохраняем только после обработки, чтобы при
  // падении прогона апдейты не потерялись (повтор поймает дедуп по website).
  const offset = FIXTURE ? 0 : await readOffset();

  let updates = [];
  if (FIXTURE) {
    const fs = await import('node:fs');
    updates = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    console.log(`Фикстура: апдейтов ${updates.length}`);
  } else {
    await ensurePolling();
    try {
      updates = await tg('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
    } catch (e) {
      if (e.code === 409) {
        // Вебхук мог быть задан позже — снимаем и повторяем один раз.
        await tg('deleteWebhook', { drop_pending_updates: false });
        console.log('Снят вебхук бота после 409 (getUpdates работает только без него)');
        updates = await tg('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
      } else {
        throw e;
      }
    }
  }
  stats.updates = updates.length;
  console.log(`Апдейтов получено: ${updates.length}`);

  const state = await existingState();
  console.log(`Ключей дублей: ${state.websites.size} ссылок, ${state.keys.size} пар title|дата (строк ${state.total})`);

  for (const up of updates) {
    const msg = up.message;
    if (!msg) continue;
    const username = String(msg.chat?.username || '').toLowerCase();
    const group = BY_USERNAME.get(username);
    if (!group) continue;
    stats.ours++;
    if (stats.created >= MAX_CARDS) break;
    try {
      await handleMessage(msg, group, state, stats);
    } catch (e) {
      stats.errors++;
      console.error(`  ошибка обработки ${username}/${msg.message_id}: ${e.message}`);
    }
  }

  if (!FIXTURE) {
    const lastId = updates.length ? updates[updates.length - 1].update_id : 0;
    if (lastId >= offset) await saveOffset(lastId + 1);
  }

  console.log(
    `Готово: апдейтов ${stats.updates}, из наших групп ${stats.ours}, `
    + `не дата ${stats.noDate}, прошедшие ${stats.past}, мусор ${stats.garbage}, `
    + `дубли ${stats.dupes}, карточек ${stats.created}, ошибок ${stats.errors}.`,
  );
  if (stats.ours === 0 && stats.updates > 0) {
    console.log('Подсказка: 0 сообщений из групп — проверьте, что бот добавлен в группу и privacy mode отключён (или бот админ без прав).');
  }
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
