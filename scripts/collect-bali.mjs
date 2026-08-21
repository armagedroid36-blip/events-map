// Сборщик событий Бали: Балифорум (baliforum.ru) → база Supabase (статус «на модерации»).
// Запускается по расписанию в GitHub Actions (или вручную).
// API Балифорума открытый, без ключа. Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE.
import { createClient } from '@supabase/supabase-js';

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

const MAX_EVENTS = Number(process.env.MAX_EVENTS || 60); // лимит новых событий за один запуск
const MAX_PAGES = 60;    // предохранитель: сколько страниц листаем максимум
const DAYS_AHEAD = 120;  // горизонт планирования, дней
const DESC_LIMIT = 3000; // максимум символов описания (полные описания Балифорума длинные)
const DRY_RUN = process.env.DRY_RUN === '1'; // тест без записи в базу

// ===== Типы Балифорума → наши категории =====
const TYPE_MAP = {
  'Концерт': 'concert', 'Музыка': 'concert', 'Живая музыка': 'concert',
  'Импровизация': 'concert', 'Открытый микрофон': 'concert',
  'Вечеринка': 'party', 'Танцы': 'party', 'Игра': 'party',
  'Выставка': 'exhibition', 'Искусство': 'exhibition', 'Ремесло': 'exhibition',
  'Еда': 'food',
  'Бизнес': 'conference', 'IT': 'conference', 'Тренинг': 'conference',
  'Спорт': 'sport',
  'Кино': 'lecture', 'Здоровье': 'lecture', 'Йога': 'lecture',
  'Медитация': 'lecture', 'Духовное': 'lecture',
  'Дети': 'festival', 'Семья': 'festival', 'Рождество': 'festival',
  'Ярмарка': 'festival', 'Шопинг': 'festival',
};
const DEFAULT_CAT = 'lecture';

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
  for (const t of types) {
    const id = TYPE_MAP[t.name];
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
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .map((t) => decodeEntities(t).trim())
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
  const text = decodeEntities(blocks.map((b) => (b.data && b.data.text ? b.data.text : '')).join(' '));
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
  const site = text.match(/https?:\/\/(?!t\.me|telegram|static\.baliforum|baliforum|instagram|facebook|youtube|wa\.me|api\.|maps\.|goo\.gl)[a-z0-9-]+(\.[a-z0-9-]+)+/i);
  if (site) {
    // пост-фильтр по полному домену: отсечь www.-варианты заблокированных (www.instagram.com и т.п.)
    const host = site[0].replace(/^https?:\/\/(?:www\.)?/i, '');
    if (!/(^|\.)(t\.me|telegram\.me|baliforum\.ru|instagram\.com|facebook\.com|youtube\.com|wa\.me|goo\.gl|maps\.|api\.)/i.test(host)) out.contact = site[0];
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res.json();
}

async function existingKeys() {
  const { data, error } = await db.from('events').select('title, start_date').eq('status', 'moderation');
  if (error) {
    console.error('Ошибка чтения дублей:', error.message);
    return new Set();
  }
  return new Set((data || []).map((e) => `${e.title}|${e.start_date}`));
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
      if (!loc || loc.lat == null || loc.lng == null) continue; // без координат на карту не кладём
      if (!ev.title || !ev.slug) continue;

      const key = `${ev.title}|${when.raw.startAt.slice(0, 10)}`;
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
      const startDate = when.raw.startAt.slice(0, 10);
      const endDate = when.raw.endAt ? when.raw.endAt.slice(0, 10) : null;
      const startTime = when.raw.startAt.slice(11, 16) || null;
      const endTime = when.raw.endAt ? when.raw.endAt.slice(11, 16) : null;
      const district = place.districtName || 'Bali';
      const photos = (ev.images || []).slice(0, 3).map((i) => i.previewUrl).filter(Boolean);

      const row = {
        title: decodeEntities(ev.title),
        title_ru: decodeEntities(ev.title),
        description,
        description_ru: description,
        source_lang: 'ru',
        language: 'ru',
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime,
        end_time: endTime,
        city: `${district}, Bali`,
        address: loc.address || place.title || null,
        lat: loc.lat,
        lng: loc.lng,
        category_id: pickCategory(ev.types),
        website: `${BASE}/events/${ev.slug}`,
        contact: contacts.contact || null,
        contact_telegram: contacts.contact_telegram || null,
        contact_email: contacts.contact_email || null,
        contact_phone: contacts.contact_phone || null,
        contact_instagram: contacts.contact_instagram || null,
        photos,
        price: null,
        currency: null,
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
