// Сборщик событий из русскоязычных Telegram-каналов афиш (Нячанг, Дананг).
// Каналы публичные: t.me/s/<username> отдаёт HTML без аккаунта.
// Поля: название, дата, время, место, адрес, координаты (из goo.gl/maps или геокодом),
// контакты организатора (t.me), цена (если в тексте), ссылка на пост.
// Запускается в GitHub Actions ежедневно; статус событий — «на модерации».
import { createClient } from '@supabase/supabase-js';
import { extractPrice } from './price-llm.mjs';
import { extractCategory } from './category-llm.mjs';
import { extractTime } from './time-llm.mjs';
import { extractAddressLLM } from './address-llm.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 100); // предохранитель: лимит за запуск
const MAX_PER_CHANNEL = Number(process.env.MAX_PER_CHANNEL || 10); // лимит на канал (направление)
const MAX_POSTS = Number(process.env.MAX_POSTS || 25);   // сколько свежих постов смотрим на канал
const DRY_RUN = process.env.DRY_RUN === '1';

// Каналы: город, страна. fallback — координаты центра города, используются
// ТОЛЬКО как эталон для отбраковки в geocode (геокодер «угадал» центр),
// в координаты события НЕ подставляются.
const CHANNELS = [
  {
    username: 'nyachang_ru',
    city: 'Нячанг',
    country: 'VN',
    fallback: { lat: 12.2388, lng: 109.1967 },
    keywords: ['квиз', 'йога', 'настолки', 'мафия', 'медитаци', 'мастер-класс', 'рисован', 'глин', 'концерт', 'вечеринк', 'выставк', 'фестивал', 'тур', 'экскурси', 'нетворк', 'speaking', 'english'],
  },
  {
    username: 'danang_afisha',
    city: 'Дананг',
    country: 'VN',
    fallback: { lat: 16.0544, lng: 108.2022 },
    keywords: ['квиз', 'йога', 'настолки', 'мафия', 'медитаци', 'мастер-класс', 'рисован', 'глин', 'концерт', 'вечеринк', 'выставк', 'фестивал', 'тур', 'экскурси', 'нетворк', 'speaking', 'english'],
  },
];

// ===== Месяцы и дни (русский) =====
const MONTHS = {
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6,
  'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
};
const WEEKDAYS = { 'понедельник': 1, 'понедельникa': 1, 'вторник': 2, 'вторника': 2, 'среду': 3, 'среда': 3, 'четверг': 4, 'четверга': 4, 'пятницу': 5, 'пятница': 5, 'субботу': 6, 'суббота': 6, 'воскресенье': 7, 'воскресенья': 7 };

// ===== Категории по ключевым словам =====
const CAT_RULES = [
  { cat: 'party', words: ['вечеринк', 'afterparty', 'party', 'танц', 'дискотека', 'батл'] },
  { cat: 'games', words: ['квиз', 'настолк', 'мафия', 'игра', 'турнир', 'викторин', 'своя игра', 'угадай'] },
  { cat: 'concert', words: ['концерт', 'живая музыка', 'музыкальн', 'джаз', 'dj', 'сет'] },
  { cat: 'workshop', words: ['мастер-класс', 'рисован', 'глин', 'творческ', 'создадим', 'лепить', 'курс'] },
  { cat: 'wellness', words: ['йога', 'медитаци', 'mindfulness', 'дыхательн', 'здоровь', 'психолог', 'терапи', 'массаж', 'практик'] },
  { cat: 'meetup', words: ['встреча', 'нетворк', 'клуб', 'speaking', 'english', 'разговорн', 'завтрак', 'сообщество', 'круглый стол'] },
  { cat: 'cinema', words: ['кино', 'кинопоказ', 'киноклуб', 'фильм'] },
  { cat: 'tour', words: ['тур', 'экскурси', 'треккинг', 'поход', 'дайвинг', 'водопад', 'поездк'] },
  { cat: 'exhibition', words: ['выставк', 'галере', 'арт'] },
  { cat: 'food', words: ['дегустаци', 'ужин', 'обед', 'завтрак', 'кулинарн', 'еда', 'кофе'] },
  { cat: 'sport', words: ['спорт', 'забег', 'кроссфит', 'тренировк', 'бег', 'сёрфинг', 'волейбол'] },
  { cat: 'festival', words: ['фестивал', 'ярмарк', 'праздник'] },
  { cat: 'conference', words: ['конференц', 'форум', 'лекци'] },
];
const DEFAULT_CAT = 'meetup';

function pickCategory(text) {
  const low = ` ${text.toLowerCase()} `;
  for (const r of CAT_RULES) {
    if (r.words.some((w) => low.includes(w))) return r.cat;
  }
  return DEFAULT_CAT;
}

// ===== Утилиты =====

function todayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Вычислить дату по дню недели (ближайшую, не раньше сегодня) */
function dateFromWeekday(wdNum, now) {
  const cur = now.getDay() || 7; // 1=Пн ... 7=Вс
  let diff = wdNum - cur;
  if (diff < 0) diff += 7;
  if (diff === 0) diff = 7; // сегодняшний день не берём — анонсы в будущее
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d;
}

/** Парсинг даты из текста поста. Возвращает {date: 'YYYY-MM-DD', time: 'HH:MM'} | null */
function parseDate(text) {
  const now = todayLocal();
  let date = null;

  // 1) «21 августа» / «21 авг.» — число + месяц словом
  const m1 = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
  if (m1) {
    const day = +m1[1];
    const month = MONTHS[m1[2].toLowerCase()];
    let year = now.getFullYear();
    const cand = new Date(year, month - 1, day);
    if (cand < now) year++;
    date = new Date(year, month - 1, day);
  }

  // 2) «22.08» / «22/08» / «22.08.26»
  if (!date) {
    const m2 = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (m2) {
      const day = +m2[1];
      const month = +m2[2];
      let year = m2[3] ? +m2[3] : now.getFullYear();
      if (m2[3] && m2[3].length === 2) year += 2000;
      const cand = new Date(year, month - 1, day);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && cand >= now) date = cand;
    }
  }

  // 3) День недели: «суббота 22.08» / «пятница 18:00»
  if (!date) {
    const m3 = text.match(/(понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресень[ея])/i);
    if (m3) {
      const wd = WEEKDAYS[m3[1].toLowerCase()];
      date = dateFromWeekday(wd, now);
    }
  }

  if (!date) return null;

  // Время: «14:00», «11:30», «11-30», «12:00-14:30».
  // Важно: точка (29.08) — это дата, а не время, поэтому разделитель только «:» или «-».
  let time = null;
  const tmColon = text.match(/(\d{1,2}):(\d{2})/);
  const tmDash = text.match(/(\d{1,2})-(\d{2})/);
  if (tmColon && +tmColon[1] >= 0 && +tmColon[1] <= 23 && +tmColon[2] <= 59) {
    time = `${String(+tmColon[1]).padStart(2, '0')}:${tmColon[2]}`;
  } else if (tmDash && +tmDash[1] >= 0 && +tmDash[1] <= 23 && +tmDash[2] <= 59) {
    time = `${String(+tmDash[1]).padStart(2, '0')}:${tmDash[2]}`;
  }

  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time,
  };
}

/** Из текста поста: цена. «200k», «200 000 VND», «250000», «50$», «50.000» → number */
function parsePrice(text) {
  const m = text.match(/(\d[\d\s.,]{2,})\s*(k|тыс|₫|vnd|đ|usd|\$|eur|₽|руб)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/\s/g, '').replace(/,/g, ''));
  if (m[2].toLowerCase() === 'k') n *= 1000;
  if (m[2] === '₫' || m[2].toLowerCase() === 'vnd' || m[2] === 'đ') return n; // VND оставим как есть
  return n;
}

/** Декодировать HTML-entities: &#NNN;, &#xHH;, &amp;, &lt;, &gt;, &quot;, &apos;, &nbsp;.
 *  Итеративно — покрывает двойное кодирование (&amp;#43; → &#43; → +). */
function decodeEntities(s) {
  if (!s) return s;
  let out = s;
  for (let i = 0; i < 5; i++) {
    const next = out
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Название: первая строка без эмодзи и служебных слов */
function extractTitle(text) {
  const first = decodeEntities(text).split(/\n/)[0].trim();
  const clean = first
    .replace(/[^\p{L}\p{N}\s.,!?«»"':()\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length >= 3) return clean.slice(0, 120);
  return 'Событие в ' + (text.includes('Нячанг') ? 'Нячанге' : 'городе');
}

// ===== Парсинг HTML t.me/s/ =====

/** Разбить HTML на посты */
function splitPosts(html) {
  return html.split('<div class="tgme_widget_message_wrap').slice(1);
}

function parsePost(block) {
  const pid = block.match(/data-post="([^"]+)"/)?.[1] || null;
  const dt = block.match(/datetime="([^"]+)"/)?.[1] || null;
  const tm = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>(.*?)<\/div>/s)?.[1] || '';
  const text = decodeEntities(
    tm
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim()
  );
  const links = [...new Set([...block.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))];
  // Фото поста: обложки (background-image), <img> и постеры видео.
  // Оставляем только реальные фото (URL с «cdn»), отсекая иконки/логотипы telegram.org
  const photos = [
    ...[...block.matchAll(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]),
    ...[...block.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ...[...block.matchAll(/poster="([^"]+)"/g)].map((m) => m[1]),
  ]
    .filter((u) => /cdn|telegram-cdn/i.test(u))
    .map((u) => (u.startsWith('//') ? `https:${u}` : u))
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 5);
  return { pid, dt, text, links, photos };
}

/** Ссылки goo.gl/maps и t.me из поста */
function pickLinks(links, username) {
  const mapLinks = links.filter((l) => /maps\.app\.goo\.gl|goo\.gl\/maps|google\.(com|ru)\/maps/.test(l));
  const tgLinks = links.filter((l) => /t\.me\/[a-zA-Z0-9_]{3,}/.test(l) && !l.includes(username) && !l.includes('t.me/s/'));
  return { mapLinks, tgLinks };
}

/** Разрезолвить карту и достать координаты или адрес */
async function resolveMap(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const finalUrl = res.url || url;
    // координаты в формате @12.271,-109.198 или !3d12.27!4d109.19
    const m = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), address: null, url: finalUrl };
    const m2 = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]), address: null, url: finalUrl };
    // адрес из ?q=...
    const q = finalUrl.match(/[?&]q=([^&]+)/);
    if (q) return { lat: null, lng: null, address: decodeURIComponent(q[1].replace(/\+/g, ' ')).slice(0, 200), url: finalUrl };
    // адрес из /place/...
    const pl = finalUrl.match(/\/maps\/place\/([^/]+)/);
    if (pl) return { lat: null, lng: null, address: decodeURIComponent(pl[1].replace(/\+/g, ' ')).slice(0, 200), url: finalUrl };
    return { lat: null, lng: null, address: null, url: finalUrl };
  } catch {
    return { lat: null, lng: null, address: null, url };
  }
}

/** Геокодировать адрес через Nominatim (с городом).
 *  Пробует варианты: полный адрес, затем без названия заведения (по сегментам
 *  запятых) — «606 Cafe, 86 Đoàn Trần Nghiệp, ...» → «86 Đoàn Trần Nghiệp, ...».
 *  rejectNear — координаты центра города: если Nominatim вернул точку в радиусе
 *  ~0.01° от центра (геокодер «угадал» город по названию) — вариант не годится.
 *  Если ничего не нашлось — пробует поиск по НАЗВАНИЮ места (убирает стоп-слова:
 *  «кафе рядом с Океанус» → «Океанус Nha Trang»), затем словарь известных мест. */
async function geocode(address, city, country, rejectNear) {
  if (!address) return null;
  // Мусор из Google-ссылок («..., street, ...») ломает поиск Nominatim
  address = address.replace(/,?\s*street\s*,?/gi, ', ').trim();
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  const variants = [address];
  if (parts.length > 2) {
    variants.push(parts.slice(1).join(', ')); // убрать название заведения
    variants.push(parts.slice(2).join(', ')); // улица/район + город
  }
  for (const v of variants) {
    // Если в адресе уже есть город/страна («Đà Nẵng», «Nha Trang», «Вьетнам») —
    // суффикс «Дананг, VN» дублирует и ломает поиск, пробуем и без него.
    const queries = [`${v}, ${city}, ${country}`];
    if (/đà nẵng|da nang|nha trang|hội an|ho chi minh|вьетнам|vietnam|việt nam/i.test(v)) {
      queries.push(v);
    }
    for (const qs of queries) {
      const r = await nominatim(qs, rejectNear);
      if (r) return r;
    }
  }
  // 1) Словарь известных мест (которых нет в OSM, координаты проверены вручную)
  const low = address.toLowerCase();
  for (const p of PLACE_COORDS) {
    if (low.includes(p.key)) return { lat: p.lat, lng: p.lng };
  }
  // 2) Поиск по названию: «кафе рядом с Океанус (север)» → «Океанус Nha Trang»
  const nameWords = address
    .replace(/[()]/g, ' ')
    .split(/[\s,]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));
  const name = nameWords.slice(0, 3).join(' ');
  if (name && name !== address) {
    const r = await nominatim(`${name}, ${city}, ${country}`, rejectNear);
    if (r) return r;
    const r2 = await nominatim(`${name}, ${city}`, rejectNear);
    if (r2) return r2;
  }
  return null;
}

/** Один запрос к Nominatim с отбраковкой «угадал центр города» */
async function nominatim(query, rejectNear) {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (rejectNear) {
        const dLat = lat - rejectNear.lat;
        const dLng = lng - rejectNear.lng;
        if (dLat * dLat + dLng * dLng < 0.01 * 0.01) return null; // «угадал центр»
      }
      return { lat, lng };
    }
  } catch { /* ignore */ }
  return null;
}

// Слова: которые не несут гео-смысла в названии места
const STOP_WORDS = new Set([
  'кафе', 'ресторан', 'клуб', 'настольных', 'игр', 'настолки', 'мафия',
  'место', 'локация', 'адрес', 'рядом', 'около', 'возле', 'недалеко',
  'центре', 'север', 'юг', 'восток', 'запад', 'этаж', 'лифте', 'этаже',
  'приглашает', 'занятие', 'студия', 'сеть', 'заведение', 'при', 'на', 'в',
]);

// Известные места, которых нет в OpenStreetMap (координаты проверены вручную).
// Ключ — подстрока адреса (нижний регистр).
const PLACE_COORDS = [
  { key: 'океанус', lat: 12.273779, lng: 109.202092 },  // Muong Thanh Oceanus Apartment, север Нячанга
  { key: 'oceanus', lat: 12.273779, lng: 109.202092 },
  { key: 'neverland', lat: 12.2407732, lng: 109.1894251 }, // Neverland Adventure Club, 40 Hồng Bàng (центр)
  { key: 'boton blue', lat: 12.293901, lng: 109.212355 },  // Boton Blue Hotel & Spa, Phạm Văn Đồng (север)
];

/** t.me-ник → удобный формат для нашей базы */
function normalizeTg(link) {
  const m = link.match(/t\.me\/([a-zA-Z0-9_]{3,})/);
  return m ? '@' + m[1] : null;
}

/** Адрес из текста: «📍 Локация: …», «Адрес: …», «Место: …» — первое совпадение */
function extractAddress(text) {
  const m = text.match(/(?:📍\s*)?(?:локаци[яи]|адрес|место)\s*[:—-]?\s*([^\n]{3,120})/i);
  if (!m) return null;
  return (
    m[1]
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // эмодзи
      .replace(/[.,;:!?\s]+$/g, '') // хвостовая пунктуация и пробелы
      .trim() || null
  );
}

/** Обратный геокодинг: координаты → адрес (Nominatim), fallback когда адреса нет */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const d = await res.json();
    return d.display_name || null;
  } catch {
    return null;
  }
}

// ===== Основной цикл =====

async function existingKeys() {
  const { data, error } = await db.from('events').select('title, start_date').eq('status', 'moderation');
  if (error) {
    console.error('Ошибка чтения дублей:', error.message);
    return new Set();
  }
  return new Set((data || []).map((e) => `${e.title}|${e.start_date}`));
}

async function fetchChannel(username) {
  const res = await fetch(`https://t.me/s/${username}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} для t.me/s/${username}`);
  return res.text();
}

async function main() {
  const seen = await existingKeys();
  let inserted = 0;

  for (const ch of CHANNELS) {
    if (inserted >= MAX_EVENTS) break;
    let perChannel = 0; // счётчик событий этого канала, сбрасывается на каждом канале
    console.log(`Канал: ${ch.username} (${ch.city})`);
    let html;
    try {
      html = await fetchChannel(ch.username);
    } catch (e) {
      console.error(`  ${e.message}`);
      continue;
    }

    const posts = splitPosts(html).slice(0, MAX_POSTS);
    console.log(`  Постов на странице: ${posts.length}`);

    for (const raw of posts) {
      if (inserted >= MAX_EVENTS || perChannel >= MAX_PER_CHANNEL) break;
      const post = parsePost(raw);
      if (!post.pid || !post.text) continue;
      const cleanText = decodeEntities(post.text);

      // Событие должно содержать дату в будущем
      const when = parseDate(post.text);
      if (!when) {
        console.log(`  - ${post.pid}: нет даты — пропуск`);
        continue;
      }

      const title = extractTitle(post.text);
      const key = `${title}|${when.date}`;
      if (seen.has(key)) continue;

      const { mapLinks, tgLinks } = pickLinks(post.links, ch.username);
      const contacts = tgLinks.map(normalizeTg).filter(Boolean);
      const tgMain = contacts.find((c) => !c.includes('bot')) || contacts[0] || null;

      // Координаты: из карты или геокодом
      let lat = null;
      let lng = null;
      let address = null;
      let mapUrl = null;
      if (mapLinks.length) {
        mapUrl = mapLinks[0];
        const geo = await resolveMap(mapUrl);
        lat = geo.lat;
        lng = geo.lng;
        address = geo.address || null;
      }
      // Адрес через LLM: понимает любой эмодзи (📍📌🗺️…) и просто упоминания места;
      // при ошибке/без ключа — fallback на regex. ПРИОРИТЕТ: адрес из ссылки на
      // карту (resolveMap, точный адрес Google) — он не должен затираться LLM.
      const llmAddr = await extractAddressLLM(post.text, ch.city);
      const llmOrRegex = llmAddr?.address || extractAddress(post.text) || null;
      address = address || llmOrRegex || null;
      // Если адреса нет, но координаты есть — обратный геокодинг (fallback)
      if (!address && lat != null && lng != null) {
        address = await reverseGeocode(lat, lng);
      }
      // Координаты: только из карты или геокодом. Центр города НЕ подставляем.
      if ((lat == null || lng == null) && address) {
        const g = await geocode(address, ch.city, ch.country, ch.fallback);
        if (g) { lat = g.lat; lng = g.lng; }
      }
      // Адрес из карты не геокодировался, но LLM нашёл другой (например, с улицей) — пробуем его
      if ((lat == null || lng == null) && llmOrRegex && llmOrRegex !== address) {
        const g = await geocode(llmOrRegex, ch.city, ch.country, ch.fallback);
        if (g) { lat = g.lat; lng = g.lng; address = llmOrRegex; }
      }
      // Если адрес не геокодируется или его нет — lat/lng остаются null:
      // событие не рисуется на карте (isValidCoords), но попадает в модерацию,
      // где админ увидит отсутствие координат.

      // Цена через LLM; если LLM недоступен — fallback на regex parsePrice
      let p = await extractPrice(post.text, ch.city);
      if (!p) {
        const rp = parsePrice(post.text);
        if (rp != null) p = { price: rp, currency: null, free: false, donation: false };
      }
      // Категория: LLM точнее в спорных случаях; при ошибке/без ключа — старая логика
      const llmCat = await extractCategory(post.text, ch.city);
      // Время: LLM понимает «9pm»; при ошибке/без ключа — старый regex
      const llmTime = await extractTime(post.text);
      const website = `https://t.me/${post.pid}`;

      const row = {
        title,
        title_ru: title,
        description: cleanText.slice(0, 3000),
        description_ru: cleanText.slice(0, 3000),
        source_lang: 'ru',
        language: 'ru',
        start_date: when.date,
        end_date: null,
        start_time: llmTime?.start_time || when.time || null,
        end_time: llmTime?.end_time || null,
        city: ch.city,
        address,
        lat,
        lng,
        category_id: llmCat || pickCategory(post.text),
        website,
        contact_telegram: tgMain,
        photos: post.photos ? post.photos.slice(0, 3) : [],
        price: p?.price ?? null,
        currency: p?.currency ?? null,
        donation: !!p?.donation,
        status: 'moderation',
      };

      const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${title.slice(0, 40)}»: ${error.message}`);
      } else {
        inserted++;
        perChannel++;
        seen.add(key);
        console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${title.slice(0, 45)} | ${when.date} ${when.time || ''} | ${ch.city} | ${row.category_id}${tgMain ? ' | ' + tgMain : ''}${address ? ' | ' + address.slice(0, 40) : ''}`);
      }
    }
  }

  console.log(`Готово: добавлено ${inserted}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
