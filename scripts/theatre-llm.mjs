// Модуль извлечения театральных событий из текста страницы-источника (DeepSeek).
// Используется scripts/collect-theatres.mjs (самообход источников) и
// scripts/theatre-scout.mjs (разведка площадок — там только классификация).
// Жёсткое правило: только факты со страницы. Чего нет — null. Адреса, цены и
// координаты не выдумываются, описания не сочиняются. Без ключа или при
// невалидном JSON (две попытки) модуль возвращает [] — скрипт не падает.

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const TIMEOUT_MS = 30000;

const SYSTEM_PROMPT =
  'Ты извлекаешь данные о театральных представлениях и шоу для туристов из текста страницы-источника. ' +
  'Отвечай ТОЛЬКО JSON вида {"events": [...]}. ' +
  'Каждый элемент: {"title": string, "title_en": string|null, "description": string, "schedule_kind": "daily"|"weekly"|"dates", ' +
  '"days": [1,2,3,4,5,6,7]|null, "dates": ["YYYY-MM-DD"]|null, "start_time": "HH:MM"|null, "end_time": "HH:MM"|null, ' +
  '"price": number|null, "currency": "IDR"|"VND"|"USD"|null, "venue": string|null, "address": string|null, ' +
  '"website": string, "photos": [string]|null, "contact": string|null}. ' +
  'ЖЁСТКИЕ ПРАВИЛА: ' +
  '1) Только факты, написанные на странице. Ничего не додумывай. Если поля на странице нет — null. ' +
  '2) НЕ выдумывай адреса, цены, координаты, телефоны, время начала. Нет на странице — null. ' +
  '3) Расписание отдавай структурой: каждый вечер/ежедневно → schedule_kind "daily"; перечисление дней недели → "weekly" и days (1=Пн, 7=Вс); конкретные календарные даты → "dates" и dates. ' +
  '4) Время — только 24-часовое "HH:MM" (19:30, а не 7.30 PM). Цена — число без разделителей (100000), валюта отдельно. ' +
  '5) website — канонический абсолютный URL страницы этого события/шоу (если на странице есть отдельная ссылка на шоу — она; иначе переданный URL источника). ' +
  '6) photos — только абсолютные http(s)-ссылки на изображения, реально встречающиеся в тексте/разметке. Максимум 3. ' +
  '7) description — краткое описание ТОЛЬКО из фактов страницы (что за шоу, когда, сколько идёт, сколько стоит). Не сочиняй рекламный текст. ' +
  '8) Одно шоу — один элемент. Разные площадки/разные шоу — разные элементы. Если на странице нет ни одного конкретного представления — верни {"events": []}.';

/** Разбор времени из разных форматов страницы: "7.30 PM", "19h30", "19:30-20:40". */
function normTime(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(/h/, ':').replace(/\./g, ':');
  const m = s.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Цена: строка «100,000»/«100 000»/«400.000vnd» → число. */
function normPrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CURRENCIES = new Set(['IDR', 'VND', 'USD', 'EUR', 'THB', 'RUB']);

function isHttpUrl(v) {
  return typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
}

function asString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Нормализация одного события из ответа LLM: неизвестные/битые значения отбрасываются. */
function normalizeEvent(raw, defaults) {
  if (!raw || typeof raw !== 'object') return null;
  const title = asString(raw.title);
  if (!title) return null;

  let kind = asString(raw.schedule_kind);
  if (!['daily', 'weekly', 'dates'].includes(kind)) kind = null;

  let days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
    : [];
  let dates = Array.isArray(raw.dates)
    ? [...new Set(raw.dates.map((d) => String(d).trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    : [];

  if (!kind) {
    if (dates.length) kind = 'dates';
    else if (days.length) kind = 'weekly';
    else kind = 'daily';
  }
  if (kind === 'daily') {
    days = [];
    dates = [];
  } else if (kind === 'weekly') {
    dates = [];
    if (!days.length) return null; // weekly без дней — бессмысленно
  } else if (!dates.length) {
    return null;
  }

  const start_time = normTime(raw.start_time);
  const end_time = normTime(raw.end_time);
  const price = normPrice(raw.price);
  let currency = asString(raw.currency);
  currency = currency ? currency.toUpperCase().slice(0, 3) : null;
  if (currency && !CURRENCIES.has(currency)) currency = null;
  if (price == null) currency = null;

  const photos = Array.isArray(raw.photos)
    ? [...new Set(raw.photos.map(asString).filter(isHttpUrl))].slice(0, 3)
    : [];

  const website = isHttpUrl(raw.website) ? raw.website.trim() : defaults.sourceUrl;

  return {
    title: title.slice(0, 200),
    title_en: asString(raw.title_en)?.slice(0, 200) ?? null,
    description: asString(raw.description)?.slice(0, 3000) ?? null,
    schedule_kind: kind,
    days,
    dates,
    start_time,
    end_time,
    price,
    currency,
    venue: asString(raw.venue)?.slice(0, 200) ?? null,
    address: asString(raw.address)?.slice(0, 300) ?? null,
    website,
    photos,
    contact: asString(raw.contact)?.slice(0, 200) ?? null,
  };
}

async function callLLM(userContent, systemPrompt = SYSTEM_PROMPT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Извлечь театральные события из текста страницы-источника.
 * @param {string} text текст страницы (или её фрагмент)
 * @param {{city: string, sourceUrl: string, today: string, photoCandidates?: string[]}} opts город, URL источника, дата, ссылки на фото со страницы
 * @returns {Promise<Array<object>>} массив событий (пустой при ошибке/без ключа)
 */
export async function extractTheatreEvents(text, opts = {}) {
  if (!DEEPSEEK_API_KEY || !text || String(text).trim().length < 40) return [];
  const { city = '', sourceUrl = '', today = new Date().toISOString().slice(0, 10), photoCandidates = [] } = opts;

  const photosBlock = photoCandidates.length
    ? `\nССЫЛКИ НА ИЗОБРАЖЕНИЯ СО СТРАНИЦЫ (в photos бери ТОЛЬКО из этого списка, максимум 3, самые подходящие по смыслу):\n${photoCandidates.slice(0, 12).join('\n')}\n`
    : '\nИзображений на странице не найдено — photos: null.\n';

  const userContent =
    `Город: ${city}. Сегодня: ${today}. URL источника: ${sourceUrl}\n` +
    'Извлеки все театральные представления и шоу, которые есть на странице (постоянные вечерние шоу, ' +
    'традиционные танцы, цирк, кукольные шоу). Данные — только из текста ниже.' +
    photosBlock +
    '\nТЕКСТ СТРАНИЦЫ:\n' +
    String(text).slice(0, 14000);

  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = await callLLM(userContent);
    if (!parsed) continue;
    const list = Array.isArray(parsed.events) ? parsed.events : Array.isArray(parsed) ? parsed : null;
    if (!list) continue;
    const events = list
      .map((raw) => normalizeEvent(raw, { sourceUrl }))
      .filter(Boolean);
    return events;
  }
  return [];
}

/** Экспорт для тестов/переиспользования. */
export const __test = { normTime, normPrice, normalizeEvent };

const CLASSIFY_PROMPT =
  'Ты оцениваешь кандидатов в источники театральных афиш для туристов. ' +
  'На вход — список пар «название + URL» (иногда с описанием из поиска). ' +
  'Ответь ТОЛЬКО JSON: {"items":[{"i":0,"relevant":true,"kind":"venue","reason":"кратко"}]}. ' +
  'relevant=true — если по названию и домену видно, что там есть РЕГУЛЯРНЫЕ театральные ' +
  'представления/шоу/традиционные танцы/цирк/кукольные шоу для туристов или афиша таких шоу; ' +
  'relevant=false — для гостиниц, отзывов-агрегаторов без афиши, новостей, магазинов, казино, ночных клубов, ' +
  'тур-агентств без собственной площадки, страниц-однодневок и явной рекламы. ' +
  'kind: "venue" — сайт площадки (театр, дворец, парк, храм с шоу); ' +
  '"listing" — афиша/календарь событий города; ' +
  '"aggregator" — агрегатор билетов (klook, trip.com, getyourguide, viator, tiqets и т.п.); ' +
  '"social" — соцсеть/фейсбук/инстаграм (как основной источник не годится). ' +
  'Если данных мало — relevant=false. Ничего не выдумывай.';

/**
 * Классифицировать кандидатов разведчика: есть ли там регулярные шоу и что это за тип источника.
 * @param {Array<{name: string, url: string, city?: string, snippet?: string}>} items
 * @returns {Promise<Array<{index: number, relevant: boolean, kind: string, reason: string}>>}
 */
export async function classifyTheatreSources(items) {
  if (!DEEPSEEK_API_KEY || !Array.isArray(items) || !items.length) return [];
  const list = items
    .map((it, i) => `${i}. название: ${it.name || '—'} | URL: ${it.url} | город: ${it.city || '—'}${it.snippet ? ` | из поиска: ${String(it.snippet).slice(0, 200)}` : ''}`)
    .join('\n');

  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = await callLLM(`${CLASSIFY_PROMPT}\n\nКАНДИДАТЫ:\n${list}`, CLASSIFY_PROMPT);
    if (!parsed || !Array.isArray(parsed.items)) continue;
    return parsed.items
      .map((r) => ({
        index: Number(r?.i),
        relevant: r?.relevant === true,
        kind: ['venue', 'listing', 'aggregator', 'social'].includes(r?.kind) ? r.kind : 'listing',
        reason: typeof r?.reason === 'string' ? r.reason.slice(0, 200) : '',
      }))
      .filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < items.length);
  }
  return [];
}
