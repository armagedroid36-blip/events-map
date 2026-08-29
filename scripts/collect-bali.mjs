// Сборщик событий Бали: Балифорум (baliforum.ru) → база Supabase (статус «на модерации»).
// Запускается по расписанию в GitHub Actions (или вручную).
// API Балифорума открытый, без ключа. Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js';
import { extractPrice } from './price-llm.mjs';
import { extractCategory } from './category-llm.mjs';

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

// Центры районов Бали: используются, когда у события нет точных координат,
// чтобы маркер всё равно появился на карте (в карточке — «место уточнить»).
const BALI_DISTRICT_CENTERS = {
  'canggu': { lat: -8.6475, lng: 115.1436 },
  'pererenan': { lat: -8.6395, lng: 115.1479 },
  'ubud': { lat: -8.5069, lng: 115.2625 },
  'seminyak': { lat: -8.6911, lng: 115.1605 },
  'legian': { lat: -8.7069, lng: 115.1667 },
  'kuta': { lat: -8.7235, lng: 115.1705 },
  'sanur': { lat: -8.6866, lng: 115.2629 },
  'denpasar': { lat: -8.65, lng: 115.2167 },
  'uluwatu': { lat: -8.8291, lng: 115.0849 },
  'pecatu': { lat: -8.7743, lng: 115.0989 },
  'jimbaran': { lat: -8.7901, lng: 115.1638 },
  'nusa dua': { lat: -8.801, lng: 115.23 },
  'sidemen': { lat: -8.4836, lng: 115.4431 },
  'amed': { lat: -8.3339, lng: 115.6543 },
  'lovina': { lat: -8.158, lng: 115.0295 },
  'munduk': { lat: -8.2683, lng: 115.0798 },
  'tabanan': { lat: -8.5435, lng: 115.1176 },
  'gianyar': { lat: -8.5449, lng: 115.3282 },
  // Запасной вариант — центр острова
  'bali': { lat: -8.4095, lng: 115.1889 },
};

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

/** Выбрать ближайшую будущую дату события (в пределах горизонта) */
function pickDate(eventDates) {
  if (!Array.isArray(eventDates) || !eventDates.length) return null;
  const now = todayUtc();
  const horizon = horizonDate();
  const future = eventDates
    .map((d) => ({ start: parseBaliDate(d.startAt), end: parseBaliDate(d.endAt), raw: d }))
    .filter((d) => d.start && d.start >= now && d.start <= horizon)
    .sort((a, b) => a.start - b.start);
  if (!future.length) return null;
  return future[0];
}

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

async function existingKeys() {
  const { data, error } = await db.from('events').select('title, start_date');
  if (error) {
    console.error('Ошибка чтения дублей:', error.message);
    return new Set();
  }
  return new Set((data || []).map((e) => normKey(e.title, e.start_date)));
}

// ===== Основной цикл =====

async function main() {
  const seen = await existingKeys();
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
      const title = decodeEntities(ev.title);
      const key = normKey(title, when.raw.startAt.slice(0, 10));
      if (seen.has(key)) {
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
      const startDate = when.raw.startAt.slice(0, 10);
      const endDate = when.raw.endAt ? when.raw.endAt.slice(0, 10) : null;
      const startTime = when.raw.startAt.slice(11, 16) || null;
      const endTime = when.raw.endAt ? when.raw.endAt.slice(11, 16) : null;
      const district = place.districtName || 'Bali';
      const photos = (ev.images || []).slice(0, 3).map((i) => i.previewUrl).filter(Boolean);

      // Точных координат нет — ставим центр района: событие видно на карте,
      // а в карточке будет «место уточнить у организатора».
      const center = BALI_DISTRICT_CENTERS[district.toLowerCase()] || BALI_DISTRICT_CENTERS['bali'];
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
        city: `${district}, Bali`,
        address: (loc && loc.address) || place.title || null,
        lat,
        lng,
        category_id: llmCat || pickCategory(ev.types),
        website: `${BASE}/events/${ev.slug}`,
        contact: contacts.contact || null,
        contact_telegram: contacts.contact_telegram || null,
        contact_email: contacts.contact_email || null,
        contact_phone: contacts.contact_phone || null,
        contact_instagram: contacts.contact_instagram || null,
        photos,
        price: p?.price ?? null,
        currency: p?.currency ?? null,
        donation: !!p?.donation,
        status: 'moderation',
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

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
