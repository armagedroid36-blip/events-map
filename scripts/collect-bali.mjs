// Сборщик событий Бали: Балифорум (baliforum.ru) → база Supabase (статус «на модерации»).
// Запускается по расписанию в GitHub Actions (или вручную).
// API Балифорума открытый, без ключа. Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { extractPrice } from './price-llm.mjs';
import { extractCategory } from './category-llm.mjs';
import { isInternationalArtist } from './intl-llm.mjs';
import { extractContacts as extractSharedContacts } from './contacts-regex.mjs';
import { districtFor, districtCenter, OUT_OF_BALI } from './bali-districts.mjs';
import { stripInvisible } from './text-safe.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const BASE = 'https://baliforum.ru';
const API = `${BASE}/api/v1/events`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const MAX_EVENTS = Number(process.env.MAX_EVENTS || 300); // лимит новых событий за один запуск (предохранитель: токены LLM)
const MAX_PAGES = 60;    // предохранитель: сколько страниц листаем максимум
const DAYS_AHEAD = 120;  // горизонт планирования, дней
const DESC_LIMIT = 3000; // максимум символов описания (полные описания Балифорума длинные)
const DRY_RUN = process.env.DRY_RUN === '1'; // тест без записи в базу

// ===== Типы Балифорума → наши категории =====
const TYPE_MAP = {
  'Концерт': 'concert', 'Музыка': 'concert', 'Живая музыка': 'concert',
  'Импровизация': 'concert', 'Открытый микрофон': 'concert',
  'Вечеринка': 'party', 'Танцы': 'party',
  'Выставка': 'exhibition', 'Искусство': 'exhibition', 'Ремесло': 'exhibition',
  'Еда': 'food',
  'Бизнес': 'conference', 'IT': 'conference', 'Тренинг': 'conference',
  'Спорт': 'sport',
  'Игра': 'games', 'Квиз': 'games', 'Викторина': 'games',
  'Кино': 'lecture', 'Здоровье': 'lecture', 'Йога': 'lecture',
  'Медитация': 'lecture', 'Духовное': 'lecture',
  'Дети': 'festival', 'Семья': 'festival', 'Рождество': 'festival',
  'Ярмарка': 'festival', 'Шопинг': 'festival',
};
const DEFAULT_CAT = 'lecture';

// Центры районов и словари синонимов — в scripts/bali-districts.mjs (проверяются юнит-тестом).


// ===== Утилиты =====

function todayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function horizonDate() {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() + DAYS_AHEAD);
  return d;
}

/** 'YYYY-MM-DD HH:MM:SS' -> Date (трактуем как местное время Бали, UTC+8) */
function parseBaliDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]));
}

/**
 * Выбрать ближайшую будущую дату события (в пределах горизонта).
 * Возвращает { start, end, raw, lastRaw }: raw — запись-начало (её startAt/endAt идут
 * в start_date/start_time), lastRaw — запись, которой закончился НЕПРЕРЫВНЫЙ ряд дат.
 * Зачем lastRaw: у многодневных событий Балифорум ставит КАЖДЫЙ день отдельной записью
 * с endAt=null (чемпионат 10–11 октября = две записи), поэтому end_date, взятый только
 * из raw.endAt, у таких событий оставался пустым, хотя диапазон в ленте есть.
 * Ряд тянем только внутри короткого набора «безвременных» записей (разрыв ≤ 36 ч,
 * максимум MAX_RUN_RECORDS записей и MAX_RUN_DAYS дней) — длинные ежедневные серии
 * (вечеринки, занятия, выставки) остаются без end_date, иначе диапазон был бы выдуман.
 */
/** Границы авто-диапазона: ряд из коротких «безвременных» записей (см. pickDate) */
const MAX_RUN_DAYS = 3;
const MAX_RUN_RECORDS = 3;

function pickDate(eventDates) {
  if (!Array.isArray(eventDates) || !eventDates.length) return null;
  const now = todayUtc();
  const horizon = horizonDate();
  const future = eventDates
    .map((d) => ({ start: parseBaliDate(d.startAt), end: parseBaliDate(d.endAt), raw: d }))
    .filter((d) => d.start && d.start >= now && d.start <= horizon)
    .sort((a, b) => a.start - b.start);
  if (!future.length) return null;

  const H = 3600 * 1000;
  const limit = future[0].start.getTime() + MAX_RUN_DAYS * 24 * H;
  let end = future[0].end && future[0].end > future[0].start ? future[0].end : future[0].start;
  let lastRaw = future[0].raw;
  // Диапазон тянем ТОЛЬКО по короткому ряду «безвременных» записей (startAt без endAt):
  // так источник отдаёт настоящие многодневные события (чемпионат 10–11 октября — две
  // записи 09:00→null), тогда как у сеансов/занятий/вечеринок у каждой записи есть своё
  // время (13:00→15:00), а у длинных рядов — свой смысл (выставка на месяц, ежедневная
  // вечеринка): растягивать их в один диапазон нельзя, это была бы выдуманная дата.
  if (!future[0].raw.endAt && future.length <= MAX_RUN_RECORDS) {
    for (let i = 1; i < future.length; i++) {
      if (future[i].raw.endAt) break;
      const gap = future[i].start - end;
      if (gap < 0 || gap > 36 * H) break;
      if (future[i].start.getTime() > limit) break;
      end = future[i].start;
      lastRaw = future[i].raw;
    }
  }
  return { start: future[0].start, end, raw: future[0].raw, lastRaw };
}

/** Конец диапазона события по выбранному pickDate() */
export function endDateOf(when) {
  if (!when) return null;
  const endRaw = when.lastRaw || when.raw;
  if (endRaw.endAt) return endRaw.endAt.slice(0, 10);
  if (endRaw !== when.raw) return endRaw.startAt.slice(0, 10);
  return null;
}

export { pickDate };

function pickCategory(types) {
  if (!Array.isArray(types)) return DEFAULT_CAT;
  const names = types.map((t) => t.name);
  // Квизы и игры имеют приоритет: «Вечеринка» в списке не должна перебивать «Игру»
  for (const n of names) {
    if (n === 'Квиз' || n === 'Викторина' || n === 'Игра') return 'games';
  }
  for (const n of names) {
    const id = TYPE_MAP[n];
    if (id) return id;
  }
  return DEFAULT_CAT;
}

/** Декодировать HTML-entities: &#NNN;, &#xHH;, &amp;, &lt;, &gt;, &quot;, &apos;, &nbsp; */
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Текст описания из blocks: каждый блок — абзац, переносы строк сохраняются */
function extractDescription(detail) {
  const blocks = detail?.content?.blocks;
  if (!Array.isArray(blocks)) return '';
  const text = blocks
    .map((b) => (b.data && b.data.text ? b.data.text : ''))
    .map((t) => decodeEntities(t))
    // <a>-ссылки не теряем: «текст (url)», остальные теги удаляем ниже
    .map((t) => t.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, (m, href, txt) => `${txt.trim()} (${href})`))
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return text.slice(0, DESC_LIMIT);
}

/** Контакты организатора из описания: telegram, email, телефон, сайт */
function extractContacts(detail) {
  const blocks = detail?.content?.blocks;
  if (!Array.isArray(blocks)) return {};
  const text = decodeEntities(
    blocks
      .map((b) => (b.type === 'linkTool' && b.data?.link ? b.data.link : b.data && b.data.text ? b.data.text : ''))
      .join(' ')
  );
  const out = {};
  // Telegram: ссылки t.me/telegram.me > @ник без ссылки (email не цепляем: перед @ буква)
  const tg = text.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
  if (tg) {
    out.contact_telegram = tg[0].startsWith('http') ? tg[0] : `https://${tg[0]}`;
  } else {
    const nick = text.match(/(?<![A-Za-z0-9_.+-])@([A-Za-z0-9_]{3,})/);
    if (nick) out.contact_telegram = `https://t.me/${nick[1]}`;
  }
  const email = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (email) out.contact_email = email[0];
  // Телефон: сначала явный префикс tel:, затем мобильные, затем стационарные индонезийские
  let phone = null;
  const telMatch = text.match(/tel:\s*\(?\d[\d\s\-()]{6,}\)?/i);
  if (telMatch) {
    phone = telMatch[0].replace(/^tel:\s*/i, '');
  } else {
    const m = text.match(/\+62[\d\s\-()]{7,}/)
      || text.match(/(?<![\d])\b0[78][\d]{2}[\d\s\-()]{6,}/)
      || text.match(/\(0\d{2,4}\)\s?\d{4,8}/)
      || text.match(/(?<![\d])\b0\d{2,4}[\s\-]\d{4,8}/);
    if (m) phone = m[0];
  }
  if (phone) out.contact_phone = phone.replace(/\s+/g, ' ').trim();
  // Instagram: https-ссылка > голая ссылка instagram.com/ник > inst:/ig:/instagram: ник
  const igHref = text.match(/https?:\/\/[^\s"'<>]*instagram\.com\/([A-Za-z0-9_.]+)/i);
  const igBare = igHref ? null : text.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  const igNick = !igHref && !igBare ? text.match(/(?:^|\s)(?:instagram|inst|ig)\s*[:—-]?\s*@?([A-Za-z0-9_.]{3,})/i) : null;
  const igRaw = igHref || igBare || igNick;
  if (igRaw) {
    const user = igRaw[1];
    if (!['p', 'reel', 'explore', 'stories', 'accounts', 'tags', 'share', 'discover'].includes(user.toLowerCase())) {
      out.contact_instagram = `https://www.instagram.com/${user}/`;
    }
  }
  // Сайт: ПРИОРИТЕТНО linkTool-плашка (полный link), иначе первый URL с host не в исключениях
  const lt = blocks.find((b) => b.type === 'linkTool' && b.data?.link);
  if (lt) {
    const link = decodeEntities(lt.data.link);
    const host = link.replace(/^https?:\/\/(?:www\.)?/i, '').split('/')[0].toLowerCase();
    if (!/(^|\.)(t\.me|telegram\.me|baliforum\.ru|instagram\.com|facebook\.com|youtube\.com|wa\.me|goo\.gl|maps\.|api\.)/i.test(host)) {
      out.contact = link.replace(/[.,;!?]+$/, '');
    }
  }
  if (!out.contact) {
    const urls = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const u of urls) {
      const clean = u.replace(/[.,;!?]+$/, '');
      const host = clean.replace(/^https?:\/\/(?:www\.)?/i, '').split('/')[0].toLowerCase();
      if (!/(^|\.)(t\.me|telegram\.me|baliforum\.ru|instagram\.com|facebook\.com|youtube\.com|wa\.me|goo\.gl|maps\.|api\.)/i.test(host)) {
        out.contact = clean;
        break;
      }
    }
  }
  // WhatsApp и недостающие контакты — общим извлекателем (scripts/contacts-regex.mjs):
  // у Балифорума свой разбор, но он не знает про «пишите в WA: + 62 …». Заполняем
  // только ПУСТЫЕ поля, чтобы не перебивать приоритетный разбор.
  const shared = extractSharedContacts(text);
  const digits = (v) => String(v || '').replace(/\D/g, '');
  if (shared.whatsapp) out.contact_whatsapp = shared.whatsapp;
  if (!out.contact_telegram && shared.telegram) out.contact_telegram = `https://t.me/${shared.telegram.replace(/^@/, '')}`;
  if (!out.contact_email && shared.email) out.contact_email = shared.email;
  // Если тот же номер уже стоит телефоном — не дублируем его в телефон
  if (!out.contact_phone && shared.phone && digits(shared.phone) !== digits(out.contact_whatsapp)) {
    out.contact_phone = shared.phone;
  }
  if (out.contact_phone && out.contact_whatsapp && digits(out.contact_phone) === digits(out.contact_whatsapp)) {
    delete out.contact_phone;
  }
  if (!out.contact_instagram && shared.instagram) out.contact_instagram = `https://www.instagram.com/${shared.instagram}/`;
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res.json();
}

/** Ключ дубля: title+дата в нижнем регистре (по всем статусам, не только moderation) */
function normKey(title, date) {
  return `${String(title || '').trim().toLowerCase()}|${String(date || '').trim()}`;
}

/**
 * Заголовок без эмодзи-мусора: Балифорум отдаёт название события вместе с
 * пиктограммами поста («Игра-квиз Мозгобойня Бали💜 4 года вместе🏝️»).
 * Снимаем пиктограммы/селекторы/zero-width и схлопываем пробелы.
 */
export function cleanTitle(text) {
  return stripInvisible(text || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .trim();
}

/** Загрузка ключей дублей + живых ссылок Балифорума (для защиты от повторов по slug) */
async function existingKeys() {
  let data;
  try {
    // Постранично: PostgREST отдаёт максимум 1000 строк на запрос, иначе ключи
    // части событий не загружаются и те же карточки вставляются заново.
    data = await selectAll(db, 'events', 'title, start_date, website, status');
  } catch (e) {
    console.error('Ошибка чтения дублей:', e.message);
    return { seen: new Set(), liveWebsites: [] };
  }
  const seen = new Set();
  const liveWebsites = [];
  for (const e of data || []) {
    seen.add(normKey(e.title, e.start_date));
    if ((e.status === 'active' || e.status === 'moderation') && e.website) {
      liveWebsites.push({ website: e.website, start_date: e.start_date });
    }
  }
  return { seen, liveWebsites };
}

// ===== Основной цикл =====

async function main() {
  const { seen, liveWebsites } = await existingKeys();
  let inserted = 0;
  let skipped = 0;

  outer:
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (inserted >= MAX_EVENTS) break;
    console.log(`Страница ${page}...`);
    let list;
    try {
      list = await fetchJson(`${API}?defaultList=1&page=${page}`);
    } catch (e) {
      console.error(`  ${e.message}`);
      break;
    }
    const events = list.data || [];
    if (!events.length) break;

    for (const ev of events) {
      if (inserted >= MAX_EVENTS) break outer;
      const when = pickDate(ev.eventDates);
      if (!when) continue; // нет ближайшей будущей даты
      const place = ev.place;
      const loc = place && place.location;
      if (!ev.title || !ev.slug) continue;

      // ВАЖНО: ключ дубля строим по ДЕКОДИРОВАННОМУ title (как он ляжет в базу),
      // иначе «&amp;» и «&» дают разные ключи и одно событие дублируется каждым прогоном
      // + снимаем эмодзи-мусор: Балифорум тащит ❣️🎨✨🍞 из поста прямо в название
      const title = cleanTitle(decodeEntities(ev.title));
      const key = normKey(title, when.raw.startAt.slice(0, 10));
      if (seen.has(key)) {
        skipped++;
        continue;
      }

      // Защита от дублей одного события Балифорума: тот же slug (website) уже есть
      // в живых — значит, это то же событие, у которого между прогонами «сдвинулась»
      // ближайшая дата (многодневное событие: вчера ближайшая была 29-е, сегодня 30-е).
      // Не создаём вторую карточку; 60 дней — запас на «следующий сезон» того же slug.
      const website = `${BASE}/events/${ev.slug}`;
      const startDate = when.raw.startAt.slice(0, 10);
      const twinSite = liveWebsites.find(
        (w) =>
          w.website === website &&
          Math.abs((new Date(startDate) - new Date(w.start_date)) / 86400000) <= 60,
      );
      if (twinSite) {
        skipped++;
        continue;
      }

      // Детали: описание + контакты организатора
      let detail = {};
      try {
        const resp = await fetchJson(`${API}/${ev.slug}`);
        detail = resp.data || {};
      } catch (e) {
        console.error(`  Нет деталей для «${ev.title.slice(0, 40)}»: ${e.message}`);
      }

      const description = extractDescription(detail);
      const contacts = extractContacts(detail);
      const p = await extractPrice(description, ev.place?.cityName || 'Bali');
      // Категория: LLM точнее в спорных случаях; при ошибке/без ключа — старая логика
      const typesHint = ev.types?.length ? `Типы Балифорума: ${ev.types.map((t) => t.name).join(', ')}` : 'Bali';
      const llmCat = await extractCategory(description, typesHint);
      // Метка «международный артист»: только для концертов/музыки/живой музыки —
      // отличает гастролирующих артистов от местных кавер-бэндов и резидентов.
      const MUSIC_TYPES = ['концерт', 'музыка', 'живая музыка'];
      const isMusic = (ev.types || []).some((t) =>
        MUSIC_TYPES.some((w) => String(t.name || '').toLowerCase().includes(w)),
      );
      const isInternational = isMusic ? !!(await isInternationalArtist(ev.title, description)) : false;
      const endDate = endDateOf(when);
      const startTime = when.raw.startAt.slice(11, 16) || null;
      const endTime = when.raw.endAt ? when.raw.endAt.slice(11, 16) : null;
      // districtName от источника бывает латиницей («Ubud», «Jimbaran») — в базу пишем русский
      // канон, иначе фильтр по городу на карте расщепляется («Ubud, Bali» vs «Убуд, Bali»).
      // Район: у Балифорума districtName непостоянен — один район приходит в разных
      // написаниях (Улувату / Печату (Улувату), Нуса-Дуа / Беноа (Нуса Дуа)), а иногда
      // «Нет в списке». Фильтр по городу на карте от этого расщепляется, поэтому:
      // 1) адрес карточки (самый надёжный источник: «Kerobokan Kelod, Kec. Kuta Utara»);
      // 2) словарь синонимов districtName; 3) как пришло.
      // Дубли-написания, уже разобранные в базе (04.10.2026): Гианьяр→Убуд, Букит→Беноа,
      // Денпасар (адрес Керобокан)→Керобокан, Бангли (адрес Джакарта)→вне Бали.
      const district = districtFor((loc && loc.address) || place.title || '', place.districtName);
      // Фото: у большинства событий Балифорума images пустой, реальные фото —
      // в media.content (previewUrl) и desktopPreview (обложка). Собираем из всех.
      const photos = [
        ...((ev.media?.content || []).map((m) => m.previewUrl || m.originalUrl).filter(Boolean)),
        ...(ev.images || []).map((i) => i.previewUrl).filter(Boolean),
        ...(ev.desktopPreview?.previewUrl ? [ev.desktopPreview.previewUrl] : []),
      ].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 3);

      // Точных координат нет — ставим центр района: событие видно на карте,
      // а в карточке будет «место уточнить у организатора».
      const center = districtCenter(district);
      const lat = loc && loc.lat != null ? loc.lat : center.lat;
      const lng = loc && loc.lng != null ? loc.lng : center.lng;

      const row = {
        title,
        title_ru: title,
        description,
        description_ru: description,
        source_lang: 'ru',
        language: 'ru',
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime,
        end_time: endTime,
        city: OUT_OF_BALI.has(district) ? district : `${district}, Bali`,
        address: (loc && loc.address) || place.title || null,
        lat,
        lng,
        category_id: llmCat || pickCategory(ev.types),
        website,
        contact: contacts.contact || null,
        contact_telegram: contacts.contact_telegram || null,
        contact_whatsapp: contacts.contact_whatsapp || null,
        contact_email: contacts.contact_email || null,
        contact_phone: contacts.contact_phone || null,
        contact_instagram: contacts.contact_instagram || null,
        photos,
        // free=true → price=0 («Бесплатно» на карточке); donation — отдельно (price остаётся null)
        price: p?.free ? 0 : (p?.price ?? null),
        currency: p?.currency ?? null,
        donation: !!p?.donation,
        is_international: isInternational,
        status: 'moderation',
        source_type: 'collector',
      };

      const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${ev.title.slice(0, 40)}»: ${error.message}`);
      } else {
        inserted++;
        seen.add(key);
        console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${ev.title.slice(0, 50)} (${row.city}, ${startDate} ${startTime || ''}) [${row.category_id}]${row.contact_telegram ? ' tg:' + row.contact_telegram : ''}`);
      }
    }
  }

  console.log(`Готово: добавлено ${inserted}, пропущено дублей ${skipped}.`);
}

// Импорт модуля (юнит-проверки, фикс-скрипты) не должен запускать полный сбор:
// RUN сбор только когда модуль запущен напрямую (node scripts/collect-bali.mjs).
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isDirectRun && !process.env.COLLECT_BALI_NO_RUN) {
  main().catch((e) => {
    console.error('Критическая ошибка:', e.message);
    process.exit(1);
  });
}
