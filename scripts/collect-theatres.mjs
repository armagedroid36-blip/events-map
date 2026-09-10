// Самонаполняющийся сборщик театральных событий: обход страниц-источников,
// разбор через LLM (scripts/theatre-llm.mjs), дозаполнение существующих карточек
// и вставка новых. Статус новых — «на модерации», source_type='theatre',
// category_id='theatre'. Регулярные представления: recurrence daily / weekly,
// end_date=null — архив их не трогает.
//
// Правила: никаких выдуманных данных (чего нет на странице — поле пустое),
// существующие карточки НЕ удаляются и НЕ архивируются, непустые поля не
// перезаписываются, недоступный источник — лог и пропуск.
import { createClient } from '@supabase/supabase-js';
import { extractTheatreEvents } from './theatre-llm.mjs';
import { SOURCES } from './theatre-sources.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const DRY_RUN = process.env.DRY_RUN === '1';
const DEDUP_DEBUG = process.env.DEDUP_DEBUG === '1'; // лог сопоставлений с существующими карточками
const MAX_SOURCES = Number(process.env.MAX_SOURCES || 12); // предохранитель: источников за прогон
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 60);   // предохранитель: событий за прогон
const MAX_PHOTOS = 3;

// ===== Реестр источников =====
// Живёт в scripts/theatre-sources.mjs (общий с разведчиком theatre-scout.mjs).
// ubudcenter отдаёт 202 с пустым телом из-под части IP (бот-стена) — оставлен:
// отказ обрабатывается как пропуск, 3 попытки с паузой.

// ===== СЕМЕНА: 11 уже существующих карточек (7 театральных + 4 шоу) =====
// Перенесены из прежних collect-theatres.mjs / collect-shows.mjs. НЕ удаляются
// и НЕ архивируются: если карточки в БД нет (новый проект/потеря данных) —
// вставится заново, если есть — только лог «уже есть» и дозаполнение пустых полей.
const SEEDS = [
  {
    title: 'Танцевальные представления в Ubud Palace',
    title_en: 'Traditional dance at Ubud Palace',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Классические балийские танцы каждый вечер в королевском дворце Пури Сарен Агунг (напротив рынка Убуда), 19:30, билет 100 000 IDR (покупается на месте). Программа по дням: воскресенье — Legong Mahabharata, понедельник — Legong Dance, вторник — Ramayana Ballet, среда — Legong & Barong, четверг — Legong Trance, пятница — Barong, суббота — Legong Dance.',
    description_en:
      'Classical Balinese dances every evening at the royal Puri Saren Agung palace (opposite Ubud Market), 7:30 pm, ticket IDR 100,000 (bought on site). Program by day: Sunday — Legong Mahabharata, Monday — Legong Dance, Tuesday — Ramayana Ballet, Wednesday — Legong & Barong, Thursday — Legong Trance, Friday — Barong, Saturday — Legong Dance.',
    city: 'Убуд, Bali',
    address: 'Ubud Palace (Puri Saren Agung), Jl. Raya Ubud No. 8, Ubud, Bali',
    lat: -8.506723, lng: 115.262707,
    website: 'https://www.ubudcenter.com/ubud-palace/',
    photos: ['https://ubudcenter.com/wp-content/uploads/2019/03/images-45.jpeg'],
    start_time: '19:30', price: 100000, currency: 'IDR',
  },
  {
    title: 'Танцевальные представления в храме Сарасвати',
    title_en: 'Traditional dance at Pura Saraswati',
    days: [7, 1, 2, 3, 4, 6],
    description:
      'Балийские танцевальные вечера в храме Пура Сарасвати (3 минуты пешком от Ubud Palace, у лотосового пруда), 19:30, билет 100 000 IDR. Программа: воскресенье — Janger, понедельник — Joged, вторник — Kecak, среда — Ramayana Ballet, четверг — Kecak, суббота — Legong. По пятницам представлений нет.',
    description_en:
      'Balinese dance evenings at Pura Saraswati temple (3 minutes walk from Ubud Palace, by the lotus pond), 7:30 pm, ticket IDR 100,000. Program: Sunday — Janger, Monday — Joged, Tuesday — Kecak, Wednesday — Ramayana Ballet, Thursday — Kecak, Saturday — Legong. No show on Fridays.',
    city: 'Убуд, Bali',
    address: 'Pura Taman Saraswati, Jl. Kajeng, Ubud, Bali',
    lat: -8.505856, lng: 115.261523,
    website: 'https://www.ubudcenter.com/saraswati-temple-ubud/',
    photos: ['https://ubudcenter.com/wp-content/uploads/2019/03/images-50.jpeg'],
    start_time: '19:30', price: 100000, currency: 'IDR',
  },
  {
    title: 'Танцевальные представления в храме Пура Далем',
    title_en: 'Traditional dance at Pura Dalem Ubud',
    days: [1, 2, 3, 4, 5],
    description:
      'Вечерние представления в храме Пура Далем Убуд (6 минут пешком от центра Убуда), 19:30, билет 100 000 IDR. Программа: понедельник — Kecak & Fire, вторник — Legong, среда — Bamboo Gamelan, четверг — Barong & Keris, пятница — Kecak & Fire. По выходным представлений нет.',
    description_en:
      'Evening performances at Pura Dalem Ubud temple (6 minutes walk from Ubud center), 7:30 pm, ticket IDR 100,000. Program: Monday — Kecak & Fire, Tuesday — Legong, Wednesday — Bamboo Gamelan, Thursday — Barong & Keris, Friday — Kecak & Fire. No shows on weekends.',
    city: 'Убуд, Bali',
    address: 'Pura Dalem Ubud, Jl. Raya Ubud, Ubud, Bali',
    lat: -8.50489, lng: 115.258407,
    website: 'https://www.ubudcenter.com/pura-dalem-ubud/',
    photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/17_Years_of_Sekar_Jepun_2014-11-01_03.jpg/960px-17_Years_of_Sekar_Jepun_2014-11-01_03.jpg'],
    start_time: '19:30', price: 100000, currency: 'IDR',
  },
  {
    title: 'Kecak и танцы в Padang Tegal Kaja',
    title_en: 'Kecak & dance at Padang Tegal Kaja',
    days: [7, 2, 3, 4, 6],
    description:
      'Вечерние шоу у храма Padang Tegal Kaja (район Padang Tegal, ~7 минут пешком от Monkey Forest), 19:30, билет 100 000 IDR. Программа: воскресенье — Kecak & Fire, вторник — Barong & Keris, среда — Kecak & Fire, четверг — Legong & Barong, суббота — Kecak & Fire. По понедельникам и пятницам представлений нет.',
    description_en:
      'Evening shows by Padang Tegal Kaja temple (Padang Tegal area, ~7 minutes walk from Monkey Forest), 7:30 pm, ticket IDR 100,000. Program: Sunday — Kecak & Fire, Tuesday — Barong & Keris, Wednesday — Kecak & Fire, Thursday — Legong & Barong, Saturday — Kecak & Fire. No shows on Mondays and Fridays.',
    city: 'Убуд, Bali',
    address: 'Padang Tegal Kaja, Ubud, Bali (район Padang Tegal, у Monkey Forest)',
    lat: -8.5142, lng: 115.2587,
    website: 'https://www.ubudcenter.com/ubud-things-to-do/#padang-tegal-kaja',
    photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Kecak_dancers_cliffside_Uluwatu.jpg/960px-Kecak_dancers_cliffside_Uluwatu.jpg'],
    start_time: '19:30', price: 100000, currency: 'IDR',
  },
  {
    title: 'Танцевальные представления в Bale Banjar Ubud Kelod',
    title_en: 'Traditional dance at Bale Banjar Ubud Kelod',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Балийские танцы каждый вечер в общинном доме Bale Banjar Ubud Kelod (на Jl. Monkey Forest, 6 минут пешком от центра Убуда), 19:30, билет 100 000 IDR. Программа по дням: воскресенье — Legong, понедельник — Women Perform, вторник — Classic Dance, среда — Legong & Barong, четверг — Legong, пятница — Women Perform, суббота — Frog & Barong.',
    description_en:
      'Balinese dances every evening at the Bale Banjar Ubud Kelod community hall (on Jl. Monkey Forest, 6 minutes walk from Ubud center), 7:30 pm, ticket IDR 100,000. Program by day: Sunday — Legong, Monday — Women Perform, Tuesday — Classic Dance, Wednesday — Legong & Barong, Thursday — Legong, Friday — Women Perform, Saturday — Frog & Barong.',
    city: 'Убуд, Bali',
    address: 'Bale Banjar Ubud Kelod, Jl. Monkey Forest, Ubud, Bali',
    lat: -8.509509, lng: 115.261502,
    website: 'https://www.ubudcenter.com/ubud-things-to-do/#bale-banjar-ubud-kelod',
    photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/17_Years_of_Sekar_Jepun_2014-11-01_03.jpg/960px-17_Years_of_Sekar_Jepun_2014-11-01_03.jpg'],
    start_time: '19:30', price: 100000, currency: 'IDR',
  },
  {
    title: 'Kecak Fire Dance в храме Улувату',
    title_en: 'Kecak Fire Dance at Uluwatu Temple',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Легендарный танец Kecak («Огненный танец») на скале над океаном у храма Улувату — десятки мужчин в унисон повторяют «чак-чак», в финале — танец через огонь. Ежедневно в 18:00 (в пик сезона бывает второй сеанс в 19:00), билет 150 000 IDR (взрослый) / 75 000 IDR (ребёнок 2–9 лет). Вход в храм (50–60 000 IDR) оплачивается отдельно. Приходите за час до начала за хорошие места.',
    description_en:
      'The legendary Kecak fire dance on the cliff above the ocean at Uluwatu Temple — dozens of men chanting "chak-chak" in unison, ending with a fire dance. Every day at 6:00 pm (a second show at 7:00 pm in peak season), ticket IDR 150,000 (adult) / IDR 75,000 (child 2–9). Temple entrance (IDR 50,000–60,000) is paid separately. Arrive an hour early for good seats.',
    city: 'Улувату, Bali',
    address: 'Pura Luhur Uluwatu, Jl. Raya Uluwatu, Pecatu, Bali',
    lat: -8.829369, lng: 115.084343,
    website: 'https://uluwatutemple.id/uluwatu-kecak-dance',
    photos: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Kecak_dancers_cliffside_Uluwatu.jpg/960px-Kecak_dancers_cliffside_Uluwatu.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Pura_Luhur_Uluwatu_2017-08-17_%2834%29.jpg/960px-Pura_Luhur_Uluwatu_2017-08-17_%2834%29.jpg',
    ],
    start_time: '18:00', price: 150000, currency: 'IDR',
  },
  {
    title: 'Life Puppets — кукольное шоу в Đó Theatre',
    title_en: 'Life Puppets show at Do Theatre',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      '«Живые куклы» (Rối Mơ / Life Puppets) — современное кукольное шоу по мотивам вьетнамского театра воды: необычная сцена, живой оркестр Юго-Восточной Азии, история вьетнамской деревни через 12 знаков зодиака. 50–60 минут, ежедневно (несколько сеансов — точное время смотрите на сайте). Билеты $20–26 (Klook, Tiqets, GetYourGuide или в кассе), студентам/детям — дешевле.',
    description_en:
      '"Life Puppets" (Roi Mo) — a modern puppet show inspired by Vietnamese water puppetry: an unusual stage, a live Southeast Asian orchestra and the story of a Vietnamese village told through the 12 zodiac signs. 50–60 minutes, daily (several sessions — check the website for exact times). Tickets $20–26 (Klook, Tiqets, GetYourGuide or at the box office); discounts for students and children.',
    city: 'Нячанг',
    address: 'Do Theatre, Vega City, Bai Tien Beach, Vinh Hoa, Nha Trang',
    lat: 12.300594, lng: 109.237344,
    website: 'https://dotheatre.vn/en/home',
    photos: ['https://dotheatre.vn/Uploads/544986103_719061317803874_8033286584661339671_n.jpg'],
    start_time: null, price: 20, currency: 'USD',
  },
  {
    title: 'Tata Show в VinWonders',
    title_en: 'Tata Show at VinWonders',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Грандиозное цирковое шоу принцессы Таты: акробатика, трюки и спецэффекты. Ежедневно в парке VinWonders Nha Trang.',
    description_en:
      'The spectacular circus show of Princess Tata: acrobatics, stunts and special effects. Daily at VinWonders Nha Trang.',
    city: 'Нячанг',
    address: 'VinWonders Nha Trang, Hon Tre Island, Vinh Nguyen, Nha Trang',
    lat: 12.2186, lng: 109.241,
    website: 'https://vinwonders.com/en/tata-show/',
    photos: [
      'https://static.vinwonders.com/2022/05/Hinh-anh-VinWonders-Nha-Trang-Fairy-land-Tata-show-3x2-so-3.jpg',
      'https://static.vinwonders.com/2022/05/Hinh-anh-VinWonders-Nha-Trang-Fairy-land-Tata-show-3x2-so-12.jpg',
    ],
    start_time: null, price: null, currency: null,
  },
  {
    title: 'Once Show в VinWonders',
    title_en: 'Once Show at VinWonders',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Мультимедийное шоу «Once»: танец, 3D-проекции на воду и музыку. Ежедневно в парке VinWonders Nha Trang.',
    description_en:
      'The "Once" multimedia show: dance, 3D water projections and music. Daily at VinWonders Nha Trang.',
    city: 'Нячанг',
    address: 'VinWonders Nha Trang, Hon Tre Island, Vinh Nguyen, Nha Trang',
    lat: 12.2186, lng: 109.241,
    website: 'https://vinwonders.com/en/once-show/',
    photos: [
      'https://static.vinwonders.com/2022/05/ONCE-SHOW-Water-Screen-Sorceress.jpg',
      'https://static.vinwonders.com/2022/05/ONCE-SHOW-Underwater-MEDIUM.jpg',
    ],
    start_time: null, price: null, currency: null,
  },
  {
    title: 'Шоу Charming Danang в Дананге',
    title_en: 'Charming Danang Show',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Красочное вечернее шоу о культуре Вьетнама: аозай, конические шляпы, лотосы, музыка и танец. Ежедневно 19:30–20:40.',
    description_en:
      'A colorful evening show about Vietnamese culture: ao dai, conical hats, lotus flowers, music and dance. Daily 19:30–20:40.',
    city: 'Дананг',
    address: 'Culture House of Labor Da Nang, 2 Cach Mang Thang Tam, Hoa Cuong Nam, Hai Chau, Da Nang',
    lat: 16.0544, lng: 108.2022,
    website: 'https://danangfantasticity.com/en/art/charming-danang-show',
    photos: [
      'https://danangfantasticity.com/wp-content/uploads/2016/12/show-dien-da-nang-quyen-ru-19h30-20h40-hang-ngay-01.jpg',
      'https://danangfantasticity.com/wp-content/uploads/2016/12/show-dien-da-nang-quyen-ru-19h30-20h40-hang-ngay-02.jpg',
    ],
    start_time: '19:30', end_time: '20:40', price: null, currency: null,
  },
  {
    title: 'Шоу Ao Dai в Дананге',
    title_en: 'Ao Dai Show Da Nang',
    days: [1, 2, 3, 4, 5, 6, 7],
    description:
      'Театральное шоу об истории вьетнамского платья аозай: от прошлого к настоящему, династии, традиции и современность. Каждый вечер.',
    description_en:
      'A theatrical show about the history of the Vietnamese ao dai: from past to present, dynasties, traditions and modernity. Every night.',
    city: 'Дананг',
    address: 'Trung Vuong Theatre, 30 Tran Phu, Hai Chau, Da Nang',
    lat: 16.0644, lng: 108.2244,
    website: 'https://danangfantasticity.com/en/art/ao-dai-show-da-nang',
    photos: [
      'https://danangfantasticity.com/wp-content/uploads/2022/04/300-nam-ao-dai-ngu-than-xua-hoat-canh-cho-que.jpg',
      'https://danangfantasticity.com/wp-content/uploads/2022/04/ao-dai-nu-sinh-viet-nam-1024x576.jpg',
    ],
    start_time: '19:45', price: 400000, currency: 'VND',
  },
];

// ===== Сеть =====

const MAX_FETCH_TRIES = Number(process.env.MAX_FETCH_TRIES || 3);

async function fetchText(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = res.status === 200 ? await res.text() : '';
    const text = htmlToText(html);
    // Бот-стена (202/403/пустое тело) — повтор с паузой: WAF пропускает не каждый запрос
    if ((res.status !== 200 || text.length < 200) && attempt + 1 < MAX_FETCH_TRIES) {
      clearTimeout(timer);
      await sleep(2000 + attempt * 3000);
      return fetchText(url, attempt + 1);
    }
    return { status: res.status, size: html.length, text, photos: extractImageUrls(html, url), tries: attempt + 1 };
  } catch (e) {
    if (attempt + 1 < MAX_FETCH_TRIES) {
      await sleep(2000 + attempt * 3000);
      return fetchText(url, attempt + 1);
    }
    return { status: 0, size: 0, text: '', error: e.message, tries: attempt + 1 };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#038;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ссылки на изображения страницы: og:image первым, служебные (логотипы/иконки) отсеиваем. */
function extractImageUrls(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    if (!raw) return;
    let abs;
    try {
      abs = new URL(raw.trim(), baseUrl).href;
    } catch {
      return;
    }
    if (!/^https?:\/\//i.test(abs)) return;
    if (/\.svg(\?|$)|\.gif(\?|$)/i.test(abs)) return;
    if (/logo|icon|sprite|avatar|placeholder|pixel|badge|flag/i.test(abs)) return;
    const key = abs.split('#')[0];
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img[^>]+data-src=["']([^"']+)["']/gi)) add(m[1]);
  return out.slice(0, 12);
}

/** Жива ли картинка (HEAD 200). Битые/чужие ссылки в карточку не попадают. */
async function photoOk(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return res.status === 200;
  } catch {
    return false;
  }
}

async function filterPhotos(urls) {
  const out = [];
  for (const u of urls.slice(0, MAX_PHOTOS)) {
    if (await photoOk(u)) out.push(u);
  }
  return out;
}

/** Nominatim: адрес → координаты. rejectNear — центр города (отбраковка «угадал город»). */
async function nominatim(query, rejectNear) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (rejectNear) {
      const dLat = lat - rejectNear.lat;
      const dLng = lng - rejectNear.lng;
      // 0.003° (~330 м) — ловим «угадал центр города», но не режем реальные
      // площадки в центре (Bali Nusa Dua Theatre ~0.007° от центра Нуса-Дуа)
      if (dLat * dLat + dLng * dLng < 0.003 * 0.003) return null;
    }
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Центры городов — ТОЛЬКО эталон отбраковки («Nominatim угадал город»),
 *  в координаты события не подставляются. */
const CITY_FALLBACK = {
  'Убуд, Bali': { lat: -8.5069, lng: 115.2625 },
  'Улувату, Bali': { lat: -8.8293, lng: 115.0843 },
  'Нуса-Дуа, Bali': { lat: -8.7963, lng: 115.2281 },
  'Дананг': { lat: 16.0544, lng: 108.2022 },
  'Нячанг': { lat: 12.2388, lng: 109.1967 },
};

/** Геокодирование события: полный адрес → площадка → первая часть адреса.
 *  Результат ближе 0.01° к центру города = «угадал город» → отбракован. */
async function geocodeEvent({ address, venue, city, country }) {
  const reject = CITY_FALLBACK[city] || null;
  const first = String(address || '').split(',')[0].trim();
  const variants = [...new Set([address, venue, first].map((v) => (v || '').trim()).filter((v) => v.length >= 4))];
  for (const v of variants) {
    for (const q of [`${v}, ${city}, ${country}`, `${v}, ${city}`, v]) {
      await sleep(1100); // лимит Nominatim: 1 запрос/сек
      const g = await nominatim(q, reject);
      if (g) return g;
    }
  }
  return null;
}

// ===== Дедупликация и расписание =====

/** Нормализованный ключ «title + venue/адрес» внутри города. */
function normKey(title, venue) {
  return `${title || ''}|${venue || ''}`
    .toLowerCase()
    .replace(/[«»"'`’.,:;!?()#\-–—/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Нормализованный URL: без схемы, www и хвостового слэша.
 *  Якорь СОХРАНЯЕМ: в проекте якорь используется как различитель карточек одного
 *  сайта (ubudcenter.com/ubud-things-to-do/#padang-tegal-kaja) — без него все
 *  карточки схлопываются в одну. */
function normUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = new URL(s);
    return `${x.host.replace(/^www\./i, '').toLowerCase()}${x.pathname.replace(/\/+$/, '').toLowerCase()}${x.hash.toLowerCase()}`;
  } catch {
    return s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

/** Значимые токены строки (для сравнения названий площадок). */
function tokens(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-zа-я0-9ё\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4),
  );
}

/** Слова-«шум»: встречаются почти в любом адресе города, для сопоставления площадок
 *  бесполезны (иначе «Bale Banjar Ubud Kelod» совпадает с любой карточкой Убуда,
 *  а «Legong» — с концертом на Jl. Penestanan Kelod). */
const PLACE_STOP = new Set([
  'jalan', 'street', 'road', 'avenue', 'kecamatan', 'kabupaten', 'kelod', 'kaja',
  'utara', 'selatan', 'timur', 'barat', 'indonesia', 'индонезия', 'vietnam', 'вьетнам',
  'ubud', 'bali', 'denpasar', 'canggu', 'чангу', 'kuta', 'sayan', 'nyuh', 'danang',
  'nang', 'nha', 'trang', 'нячанг', 'дананг', 'city', 'center', 'centre', 'beach',
  'пляж', 'district', 'ward', 'phuong', 'quan', 'huyen', 'tinh', 'province', 'island',
]);

/** Совпадение площадок: хотя бы один РЕДКИЙ (не город и не служебное слово) токен
 *  названия/адреса из источника найден в адресе карточки. Общие городские слова
 *  («Ubud», «Kelod») совпадением не считаются — иначе достаётся чужим карточкам. */
function placeMatches(existingAddress, evPlace) {
  const a = [...tokens(evPlace)].filter((t) => !PLACE_STOP.has(t));
  if (a.length === 0) return false;
  const b = tokens(existingAddress);
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common >= 1 && common >= Math.ceil(a.length / 2);
}

/** Общие слова в названиях шоу — для сравнения не годятся. */
const GENERIC_TITLE = new Set([
  'show', 'dance', 'dances', 'performance', 'performances', 'theatre', 'theater',
  'представление', 'представления', 'танцевальные', 'танцевальное', 'танцы', 'шоу', 'театр',
]);

/** Пересечение названий (латиница/кириллица) по значимым словам:
 *  «Tata Show» ↔ «Tata Show at VinWonders» = 1, «Uluwatu Kecak Dance» ↔
 *  «Kecak Fire Dance в храме Улувату» = 2. */
function titleOverlap(a, b) {
  const B = tokens(b);
  let n = 0;
  for (const t of tokens(a)) if (B.has(t) && !GENERIC_TITLE.has(t)) n++;
  return n;
}

/** Дата в ЛОКАЛЬНОЙ зоне как «YYYY-MM-DD» (toISOString() съезжает на день назад). */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ближайшая дата (завтра или позже), чей день недели есть в days */
function nextStartDate(days) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 9; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay() || 7;
    if (days.includes(dow)) return isoLocal(d);
  }
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return isoLocal(t);
}

function isoDay(iso) {
  return new Date(`${iso}T00:00:00`).getDay() || 7; // 1=Пн..7=Вс
}

// ===== Чтение БД =====

async function loadLive() {
  const { data, error } = await db
    .from('events')
    .select('id,title,title_en,title_ru,city,website,status,source_type,category_id,address,start_date,start_time,end_time,price,currency,photos,lat,lng,description,description_ru,description_en,recurrence,contact,source_lang')
    .in('status', ['active', 'moderation', 'needs_changes']);
  if (error) throw new Error(`чтение событий: ${error.message}`);
  return data || [];
}

// ===== Запись =====

/** Дозаполнить пустые поля существующей карточки. Непустые не трогаем.
 *  Язык текста определяем по кириллице: русское описание идёт в *_ru, иначе в *_en. */
function buildPatch(row, ev) {
  const patch = {};
  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
  if (isEmpty(row.start_time) && ev.start_time) patch.start_time = ev.start_time;
  if (isEmpty(row.end_time) && ev.end_time) patch.end_time = ev.end_time;
  if (isEmpty(row.price) && ev.price != null) patch.price = ev.price;
  if (isEmpty(row.currency) && ev.currency) patch.currency = ev.currency;
  const evAddr = ev.address || ev.venue;
  // Пустой адрес заполняем; бессмысленно короткий («ARMA») — заменяем на более полный
  if (evAddr && (isEmpty(row.address) || (String(row.address).length < 8 && evAddr.length > String(row.address).length))) {
    patch.address = evAddr;
  }
  if (isEmpty(row.lat) && ev.lat != null && ev.lng != null) { patch.lat = ev.lat; patch.lng = ev.lng; }
  if (isEmpty(row.photos) && ev.photos?.length) patch.photos = ev.photos;
  if (isEmpty(row.title_en) && ev.title_en) patch.title_en = ev.title_en;
  if (isEmpty(row.contact) && ev.contact) patch.contact = ev.contact;
  if (ev.description) {
    if (isEmpty(row.description)) patch.description = ev.description;
    if (/[а-яё]/i.test(ev.description)) {
      if (isEmpty(row.description_ru)) patch.description_ru = ev.description;
    } else if (isEmpty(row.description_en)) {
      patch.description_en = ev.description;
    }
  }
  return patch;
}

async function updateRow(id, patch) {
  if (DRY_RUN) return { error: null };
  return db.from('events').update(patch).eq('id', id);
}

/** Подготовить событие к вставке: координаты, фото, дата старта, recurrence. */
async function prepareInsert(ev, src, index) {
  let address = ev.address || ev.venue || null;
  // Слишком короткий адрес («ARMA») на карточке бесполезен — добавляем город
  if (address && address.length < 8) address = `${address}, ${src.city}`;
  const geo = await geocodeEvent({ address, venue: ev.venue, city: src.city, country: src.country });
  const lat = geo ? geo.lat : null;
  const lng = geo ? geo.lng : null;
  const photos = ev.photos?.length ? await filterPhotos(ev.photos) : [];

  let start_date;
  let end_date = null;
  let recurrence;
  if (ev.schedule_kind === 'weekly') {
    start_date = nextStartDate(ev.days);
    recurrence = { freq: 'weekly', days: ev.days };
  } else if (ev.schedule_kind === 'dates') {
    const today = isoLocal(new Date());
    const future = ev.dates.filter((d) => d >= today);
    start_date = future[0] || ev.dates[ev.dates.length - 1];
    end_date = future.length ? future[future.length - 1] : null;
    recurrence = null;
  } else {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    start_date = isoLocal(t);
    recurrence = { freq: 'daily' };
  }

  const lang = src.lang || 'en';
  // Язык текста важнее языка страницы: LLM пишет описания по-русски, и они
  // должны попасть в *_ru, а не в *_en (иначе на /en/ уезжает русский текст).
  const isCyr = (s) => /[а-яё]/i.test(s || '');
  const descRu = ev.description && isCyr(ev.description) ? ev.description : null;
  const descEn = ev.description_en || (ev.description && !isCyr(ev.description) ? ev.description : null);
  return {
    title: ev.title,
    title_ru: isCyr(ev.title) ? ev.title : null,
    title_en: ev.title_en || (!isCyr(ev.title) ? ev.title : null),
    description: ev.description,
    description_ru: descRu,
    description_en: descEn,
    source_lang: lang,
    language: lang,
    start_date,
    end_date,
    start_time: ev.start_time,
    end_time: ev.end_time,
    city: src.city,
    address,
    lat,
    lng,
    category_id: 'theatre',
    website: ev.website || src.url,
    contact: ev.contact || null,
    photos,
    price: ev.price,
    currency: ev.currency,
    donation: false,
    recurrence,
    status: 'moderation',
    source_type: 'theatre',
    _index: index,
  };
}

// ===== Основной поток =====

async function main() {
  const today = isoLocal(new Date());
  const live = await loadLive();
  const liveTheatre = live.filter((e) => e.source_type === 'theatre');
  console.log(`Живых театральных карточек: ${liveTheatre.length} (всего живых: ${live.length})`);

  const byWebsite = new Map();
  const byKey = new Map();
  for (const e of live) {
    if (e.website) byWebsite.set(normUrl(e.website), e);
    byKey.set(`${e.city}|${normKey(e.title, e.address)}`, e);
  }

  /** Найти существующую карточку: URL → ключ title+venue → площадка/название.
   *  URL самого ЛИСТИНГА игнорируем как ключ — иначе все события такой страницы
   *  схлопнулись бы в одну карточку (kind='listing').
   *  Нечёткое сопоставление (площадка/название) идёт ТОЛЬКО по театральным
   *  карточкам: иначе театральные данные дозаполняют чужое событие (был баг —
   *  «Legong» дозаполнил концерт Ghetto Kumbé по общему слову «Ubud/Kelod»). */
  function findExisting(ev, city, src) {
    const urlUsable = ev.website && !(src && src.kind === 'listing' && normUrl(ev.website) === normUrl(src.url));
    const byUrl = urlUsable ? byWebsite.get(normUrl(ev.website)) : null;
    if (byUrl) {
      if (DEDUP_DEBUG) console.log(`    · сопоставлено по URL: «${ev.title}» → «${byUrl.title.slice(0, 45)}»`);
      return byUrl;
    }
    const byK = byKey.get(`${city}|${normKey(ev.title, ev.address || ev.venue)}`);
    if (byK) {
      if (DEDUP_DEBUG) console.log(`    · сопоставлено по ключу title+venue: «${ev.title}» → «${byK.title.slice(0, 45)}»`);
      return byK;
    }

    // Кандидаты: та же площадка ИЛИ похожее название (внутри города)
    const place = ev.venue || ev.address;
    const score = (e) =>
      (place && e.address && placeMatches(e.address, place) ? 3 : 0) +
      Math.max(
        titleOverlap(ev.title, e.title),
        titleOverlap(ev.title, e.title_en),
        titleOverlap(ev.title_en, e.title),
        titleOverlap(ev.title_en, e.title_en),
      );

    let best = null;
    let bestScore = 0;
    let count = 0;
    for (const e of live) {
      if (e.city !== city) continue;
      // Чужие карточки (сбор/организатор) нечётко не сопоставляем и не правим
      if (e.source_type !== 'theatre' && e.category_id !== 'theatre') continue;
      const s = score(e);
      if (!s) continue;
      count++;
      if (s > bestScore) { bestScore = s; best = e; }
    }
    if (!best) return null;
    if (DEDUP_DEBUG) {
      console.log(`    · сопоставлено по площадке/названию (${count} вариант(ов), оценка ${bestScore}): «${ev.title}» → «${best.title.slice(0, 45)}»`);
    }
    return best;
  }

  const totals = { inserted: 0, updated: 0, skipped: 0, sources: 0, failed: 0, ambiguous: 0 };
  let eventsSeen = 0;

  /** URL уже занят другой живой карточкой → добавить якорь-различитель. */
  function uniqueWebsite(url, ev) {
    const base = String(url || '').split('#')[0];
    const n = normUrl(url);
    if (!live.some((e) => e.website && normUrl(e.website) === n)) return url;
    const slug = String(ev.title_en || ev.title || 'show')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return `${base}${slug ? `#${slug}` : `#event-${Date.now()}`}`;
  }

  // --- Обход источников ---
  for (const src of SOURCES.slice(0, MAX_SOURCES)) {
    if (eventsSeen >= MAX_EVENTS) {
      console.log(`Достигнут MAX_EVENTS=${MAX_EVENTS} — остальные источники пропущены`);
      break;
    }
    totals.sources++;
    const res = await fetchText(src.url);
    if (res.status !== 200 || res.text.length < 200) {
      totals.failed++;
      console.log(`ИСТОЧНИК НЕДОСТУПЕН: ${src.name} — HTTP ${res.status || res.error}, ${res.size} б, попыток ${res.tries || 1} → пропуск`);
      continue;
    }
    const events = await extractTheatreEvents(res.text, {
      city: src.city,
      sourceUrl: src.url,
      today,
      photoCandidates: res.photos || [],
    });
    console.log(`Источник «${src.name}» — HTTP ${res.status}, ${res.size} б, найдено ${events.length}`);
    if (!events.length) {
      console.log('  - ни одного представления не извлечено — пропуск');
      continue;
    }

    for (const ev of events) {
      if (eventsSeen >= MAX_EVENTS) break;
      eventsSeen++;
      const existing = findExisting(ev, src.city, src);

      if (existing) {
        // Защита: театральный сбор не правит карточки других источников
        // (сборщик/организатор) — даже при совпадении URL
        if (existing.source_type !== 'theatre' && existing.category_id !== 'theatre') {
          console.log(`  ! «${ev.title.slice(0, 40)}» совпало с нетеатральной карточкой «${existing.title.slice(0, 35)}» (${existing.source_type}) — пропуск`);
          totals.skipped++;
          continue;
        }
        // Дозаполнение пустых полей; координаты — только если адрес уже есть/получен
        if (existing.lat == null && (ev.address || ev.venue)) {
          const g = await geocodeEvent({ address: ev.address, venue: ev.venue, city: src.city, country: src.country });
          if (g) { ev.lat = g.lat; ev.lng = g.lng; }
        }
        if (!existing.photos?.length && ev.photos?.length) ev.photos = await filterPhotos(ev.photos);
        const patch = buildPatch(existing, ev);
        if (Object.keys(patch).length) {
          const { error } = await updateRow(existing.id, patch);
          if (error) {
            console.error(`  Ошибка обновления «${existing.title.slice(0, 40)}»: ${error.message}`);
          } else {
            totals.updated++;
            Object.assign(existing, patch);
            console.log(`  ${DRY_RUN ? '[dry] ~' : '~'} обновлено: ${existing.title.slice(0, 45)} | ${Object.keys(patch).join(',')}`);
          }
        } else {
          totals.skipped++;
          console.log(`  = без изменений: ${ev.title.slice(0, 50)}`);
        }
        continue;
      }

      const row = await prepareInsert(ev, src, eventsSeen);
      delete row._index;
      // Якорь-различитель: сайт-листинг не может быть ключом сразу для нескольких
      // карточек (иначе следующий прогон схлопнет их в одну).
      row.website = uniqueWebsite(row.website, ev);
      const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
      if (error) {
        console.error(`  Ошибка вставки «${ev.title.slice(0, 40)}»: ${error.message}`);
        continue;
      }
      totals.inserted++;
      const rec = row.recurrence ? (row.recurrence.freq === 'daily' ? 'ежедневно' : `weekly [${row.recurrence.days}]`) : `dates до ${row.end_date}`;
      console.log(
        `  ${DRY_RUN ? '[dry] +' : '+'} ${row.title.slice(0, 45)} | ${row.start_date} ${row.start_time || ''} | ${rec} | ${row.city} | ${row.price ?? ''} ${row.currency || ''} | ${row.website.slice(0, 50)}`,
      );
      const created = { ...row, id: `new-${totals.inserted}`, status: 'moderation' };
      byWebsite.set(normUrl(row.website), created);
      byKey.set(`${row.city}|${normKey(row.title, row.address)}`, created);
      live.push(created);
    }
    await sleep(1000);
  }

  // --- Семена: гарантия, что 11 существующих карточек на месте (не удаляем/не архивируем) ---
  let seedsKept = 0;
  for (const s of SEEDS) {
    const seedAsEvent = { title: s.title, title_en: s.title_en, address: s.address, venue: s.address, website: s.website };
    const existing = findExisting(seedAsEvent, s.city);
    if (existing) {
      seedsKept++;
      continue;
    }
    // Карточки в БД нет — восстанавливаем из семени
    const photos = await filterPhotos(s.photos || []);
    const row = {
      title: s.title,
      title_ru: s.title,
      title_en: s.title_en,
      description: s.description,
      description_ru: s.description,
      description_en: s.description_en,
      source_lang: 'ru',
      language: null,
      start_date: nextStartDate(s.days),
      end_date: null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      city: s.city,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      category_id: 'theatre',
      website: s.website,
      contact: null,
      photos,
      price: s.price ?? null,
      currency: s.currency ?? null,
      donation: false,
      recurrence: s.days.length === 7 ? { freq: 'daily' } : { freq: 'weekly', days: s.days },
      status: 'moderation',
      source_type: 'theatre',
    };
    const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
    if (error) {
      console.error(`  Ошибка восстановления семени «${s.title.slice(0, 40)}»: ${error.message}`);
    } else {
      totals.inserted++;
      console.log(`  ${DRY_RUN ? '[dry] +' : '+'} [семя] ${s.title.slice(0, 45)} | ${row.start_date} | ${s.city}`);
    }
  }

  console.log(
    `Готово: источников ${totals.sources} (недоступно ${totals.failed}), вставлено ${totals.inserted}, обновлено ${totals.updated}, без изменений ${totals.skipped}, семян на месте ${seedsKept}/${SEEDS.length}.`,
  );
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
