// Сборщик «театральных представлений для туристов»: постоянные вечерние шоу
// Бали (Убуд, Улувату) и Нячанга (Đó Theatre). Расписание стабильное и
// проверено вручную 07.09.2026 по ubudcenter.com (таблицы по дням), сайту
// dotheatre.vn и uluwatutemple.id; адреса/координаты — Nominatim, фото
// проверены (HTTP 200). События регулярные: recurrence daily (ежедневно) или
// weekly с днями недели (1=Пн..7=Вс), end_date null — архив их не трогает.
// Статус — «на модерации»; дедуп по website (как в collect-shows.mjs).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';

// Дни недели: 1=Пн .. 7=Вс (isoDayOfWeek проекта)
const DAY = { пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, вс: 7 };

/** Программа по дням -> человекочитаемые строки (ru/en) */
const W = { ru: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'], en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] };

const SHOWS = [
  {
    title: 'Танцевальные представления в Ubud Palace',
    title_en: 'Traditional dance at Ubud Palace',
    // days: ежедневно, программа по дням
    days: [1, 2, 3, 4, 5, 6, 7],
    program: {
      ru: { 7: 'Legong Mahabharata', 1: 'Legong Dance', 2: 'Ramayana Ballet', 3: 'Legong & Barong', 4: 'Legong Trance', 5: 'Barong', 6: 'Legong Dance' },
      en: { 7: 'Legong Mahabharata', 1: 'Legong Dance', 2: 'Ramayana Ballet', 3: 'Legong & Barong', 4: 'Legong Trance', 5: 'Barong', 6: 'Legong Dance' },
    },
    description:
      'Классические балийские танцы каждый вечер в королевском дворце Пури Сарен Агунг (напротив рынка Убуда), 19:30, билет 100 000 IDR (покупается на месте). Программа по дням: воскресенье — Legong Mahabharata, понедельник — Legong Dance, вторник — Ramayana Ballet, среда — Legong & Barong, четверг — Legong Trance, пятница — Barong, суббота — Legong Dance.',
    description_en:
      'Classical Balinese dances every evening at the royal Puri Saren Agung palace (opposite Ubud Market), 7:30 pm, ticket IDR 100,000 (bought on site). Program by day: Sunday — Legong Mahabharata, Monday — Legong Dance, Tuesday — Ramayana Ballet, Wednesday — Legong & Barong, Thursday — Legong Trance, Friday — Barong, Saturday — Legong Dance.',
    city: 'Убуд, Bali',
    address: 'Ubud Palace (Puri Saren Agung), Jl. Raya Ubud No. 8, Ubud, Bali',
    lat: -8.506723, lng: 115.262707, // Nominatim: Puri Saren Agung
    website: 'https://www.ubudcenter.com/ubud-palace/',
    photos: ['https://ubudcenter.com/wp-content/uploads/2019/03/images-45.jpeg'],
    start_time: '19:30',
    price: 100000, currency: 'IDR',
  },
  {
    title: 'Танцевальные представления в храме Сарасвати',
    title_en: 'Traditional dance at Pura Saraswati',
    days: [7, 1, 2, 3, 4, 6], // ежедневно, кроме пятницы
    program: {
      ru: { 7: 'Janger', 1: 'Joged', 2: 'Kecak Dance', 3: 'Ramayana Ballet', 4: 'Kecak Dance', 6: 'Legong' },
      en: { 7: 'Janger', 1: 'Joged', 2: 'Kecak Dance', 3: 'Ramayana Ballet', 4: 'Kecak Dance', 6: 'Legong' },
    },
    description:
      'Балийские танцевальные вечера в храме Пура Сарасвати (3 минуты пешком от Ubud Palace, у лотосового пруда), 19:30, билет 100 000 IDR. Программа: воскресенье — Janger, понедельник — Joged, вторник — Kecak, среда — Ramayana Ballet, четверг — Kecak, суббота — Legong. По пятницам представлений нет.',
    description_en:
      'Balinese dance evenings at Pura Saraswati temple (3 minutes walk from Ubud Palace, by the lotus pond), 7:30 pm, ticket IDR 100,000. Program: Sunday — Janger, Monday — Joged, Tuesday — Kecak, Wednesday — Ramayana Ballet, Thursday — Kecak, Saturday — Legong. No show on Fridays.',
    city: 'Убуд, Bali',
    address: 'Pura Taman Saraswati, Jl. Kajeng, Ubud, Bali',
    lat: -8.505856, lng: 115.261523, // Nominatim: Pura Taman Saraswati
    website: 'https://www.ubudcenter.com/saraswati-temple-ubud/',
    photos: ['https://ubudcenter.com/wp-content/uploads/2019/03/images-50.jpeg'],
    start_time: '19:30',
    price: 100000, currency: 'IDR',
  },
  {
    title: 'Танцевальные представления в храме Пура Далем',
    title_en: 'Traditional dance at Pura Dalem Ubud',
    days: [1, 2, 3, 4, 5], // Пн–Пт
    program: {
      ru: { 1: 'Kecak & Fire', 2: 'Legong', 3: 'Bamboo Gamelan', 4: 'Barong & Keris', 5: 'Kecak & Fire' },
      en: { 1: 'Kecak & Fire', 2: 'Legong', 3: 'Bamboo Gamelan', 4: 'Barong & Keris', 5: 'Kecak & Fire' },
    },
    description:
      'Вечерние представления в храме Пура Далем Убуд (6 минут пешком от центра Убуда), 19:30, билет 100 000 IDR. Программа: понедельник — Kecak & Fire, вторник — Legong, среда — Bamboo Gamelan, четверг — Barong & Keris, пятница — Kecak & Fire. По выходным представлений нет.',
    description_en:
      'Evening performances at Pura Dalem Ubud temple (6 minutes walk from Ubud center), 7:30 pm, ticket IDR 100,000. Program: Monday — Kecak & Fire, Tuesday — Legong, Wednesday — Bamboo Gamelan, Thursday — Barong & Keris, Friday — Kecak & Fire. No shows on weekends.',
    city: 'Убуд, Bali',
    address: 'Pura Dalem Ubud, Jl. Raya Ubud, Ubud, Bali',
    lat: -8.50489, lng: 115.258407, // Nominatim: Pura Dalem Ubud
    website: 'https://www.ubudcenter.com/pura-dalem-ubud/',
    photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/17_Years_of_Sekar_Jepun_2014-11-01_03.jpg/960px-17_Years_of_Sekar_Jepun_2014-11-01_03.jpg'],
    start_time: '19:30',
    price: 100000, currency: 'IDR',
  },
  {
    title: 'Kecak и танцы в Padang Tegal Kaja',
    title_en: 'Kecak & dance at Padang Tegal Kaja',
    days: [7, 2, 3, 4, 6], // Вс, Вт, Ср, Чт, Сб
    program: {
      ru: { 7: 'Kecak & Fire', 2: 'Barong & Keris', 3: 'Kecak & Fire', 4: 'Legong & Barong', 6: 'Kecak & Fire' },
      en: { 7: 'Kecak & Fire', 2: 'Barong & Keris', 3: 'Kecak & Fire', 4: 'Legong & Barong', 6: 'Kecak & Fire' },
    },
    description:
      'Вечерние шоу у храма Padang Tegal Kaja (район Padang Tegal, ~7 минут пешком от Monkey Forest), 19:30, билет 100 000 IDR. Программа: воскресенье — Kecak & Fire, вторник — Barong & Keris, среда — Kecak & Fire, четверг — Legong & Barong, суббота — Kecak & Fire. По понедельникам и пятницам представлений нет.',
    description_en:
      'Evening shows by Padang Tegal Kaja temple (Padang Tegal area, ~7 minutes walk from Monkey Forest), 7:30 pm, ticket IDR 100,000. Program: Sunday — Kecak & Fire, Tuesday — Barong & Keris, Wednesday — Kecak & Fire, Thursday — Legong & Barong, Saturday — Kecak & Fire. No shows on Mondays and Fridays.',
    city: 'Убуд, Bali',
    address: 'Padang Tegal Kaja, Ubud, Bali (район Padang Tegal, у Monkey Forest)',
    lat: -8.5142, lng: 115.2587,
    // Координаты: район Padang Tegal Kaja, ~500 м севернее входа Monkey Forest
    // (-8.518735/115.258320, Nominatim) — по ubudcenter.com «7 минут пешком»
    website: 'https://www.ubudcenter.com/ubud-things-to-do/#padang-tegal-kaja',
    photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Kecak_dancers_cliffside_Uluwatu.jpg/960px-Kecak_dancers_cliffside_Uluwatu.jpg'],
    start_time: '19:30',
    price: 100000, currency: 'IDR',
  },
  {
    title: 'Танцевальные представления в Bale Banjar Ubud Kelod',
    title_en: 'Traditional dance at Bale Banjar Ubud Kelod',
    days: [1, 2, 3, 4, 5, 6, 7], // ежедневно
    program: {
      ru: { 7: 'Legong', 1: 'Women Perform', 2: 'Classic Dance', 3: 'Legong & Barong', 4: 'Legong', 5: 'Women Perform', 6: 'Frog & Barong' },
      en: { 7: 'Legong', 1: 'Women Perform', 2: 'Classic Dance', 3: 'Legong & Barong', 4: 'Legong', 5: 'Women Perform', 6: 'Frog & Barong' },
    },
    description:
      'Балийские танцы каждый вечер в общинном доме Bale Banjar Ubud Kelod (на Jl. Monkey Forest, 6 минут пешком от центра Убуда), 19:30, билет 100 000 IDR. Программа по дням: воскресенье — Legong, понедельник — Women Perform, вторник — Classic Dance, среда — Legong & Barong, четверг — Legong, пятница — Women Perform, суббота — Frog & Barong.',
    description_en:
      'Balinese dances every evening at the Bale Banjar Ubud Kelod community hall (on Jl. Monkey Forest, 6 minutes walk from Ubud center), 7:30 pm, ticket IDR 100,000. Program by day: Sunday — Legong, Monday — Women Perform, Tuesday — Classic Dance, Wednesday — Legong & Barong, Thursday — Legong, Friday — Women Perform, Saturday — Frog & Barong.',
    city: 'Убуд, Bali',
    address: 'Bale Banjar Ubud Kelod, Jl. Monkey Forest, Ubud, Bali',
    lat: -8.509509, lng: 115.261502, // Nominatim: Balai Banjar Ubud kelod
    website: 'https://www.ubudcenter.com/ubud-things-to-do/#bale-banjar-ubud-kelod',
    photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/17_Years_of_Sekar_Jepun_2014-11-01_03.jpg/960px-17_Years_of_Sekar_Jepun_2014-11-01_03.jpg'],
    start_time: '19:30',
    price: 100000, currency: 'IDR',
  },
  {
    title: 'Kecak Fire Dance в храме Улувату',
    title_en: 'Kecak Fire Dance at Uluwatu Temple',
    days: [1, 2, 3, 4, 5, 6, 7], // ежедневно
    program: { ru: {}, en: {} },
    description:
      'Легендарный танец Kecak («Огненный танец») на скале над океаном у храма Улувату — десятки мужчин в унисон повторяют «чак-чак», в финале — танец через огонь. Ежедневно в 18:00 (в пик сезона бывает второй сеанс в 19:00), билет 150 000 IDR (взрослый) / 75 000 IDR (ребёнок 2–9 лет). Вход в храм (50–60 000 IDR) оплачивается отдельно. Приходите за час до начала за хорошие места.',
    description_en:
      'The legendary Kecak fire dance on the cliff above the ocean at Uluwatu Temple — dozens of men chanting "chak-chak" in unison, ending with a fire dance. Every day at 6:00 pm (a second show at 7:00 pm in peak season), ticket IDR 150,000 (adult) / IDR 75,000 (child 2–9). Temple entrance (IDR 50,000–60,000) is paid separately. Arrive an hour early for good seats.',
    city: 'Улувату, Bali',
    address: 'Pura Luhur Uluwatu, Jl. Raya Uluwatu, Pecatu, Bali',
    lat: -8.829369, lng: 115.084343, // Nominatim: Pura Luhur Uluwatu
    website: 'https://uluwatutemple.id/uluwatu-kecak-dance',
    photos: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Kecak_dancers_cliffside_Uluwatu.jpg/960px-Kecak_dancers_cliffside_Uluwatu.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Pura_Luhur_Uluwatu_2017-08-17_%2834%29.jpg/960px-Pura_Luhur_Uluwatu_2017-08-17_%2834%29.jpg',
    ],
    start_time: '18:00',
    price: 150000, currency: 'IDR',
  },
  {
    title: 'Life Puppets — кукольное шоу в Đó Theatre',
    title_en: 'Life Puppets show at Do Theatre',
    days: [1, 2, 3, 4, 5, 6, 7], // ежедневно, сеансы по сайту
    program: { ru: {}, en: {} },
    description:
      '«Живые куклы» (Rối Mơ / Life Puppets) — современное кукольное шоу по мотивам вьетнамского театра воды: необычная сцена, живой оркестр Юго-Восточной Азии, история вьетнамской деревни через 12 знаков зодиака. 50–60 минут, ежедневно (несколько сеансов — точное время смотрите на сайте). Билеты $20–26 (Klook, Tiqets, GetYourGuide или в кассе), студентам/детям — дешевле.',
    description_en:
      '"Life Puppets" (Roi Mo) — a modern puppet show inspired by Vietnamese water puppetry: an unusual stage, a live Southeast Asian orchestra and the story of a Vietnamese village told through the 12 zodiac signs. 50–60 minutes, daily (several sessions — check the website for exact times). Tickets $20–26 (Klook, Tiqets, GetYourGuide or at the box office); discounts for students and children.',
    city: 'Нячанг',
    address: 'Do Theatre, Vega City, Bai Tien Beach, Vinh Hoa, Nha Trang',
    lat: 12.300594, lng: 109.237344, // Nominatim: Do theater, Phường Bắc Nha Trang
    website: 'https://dotheatre.vn/en/home',
    photos: ['https://dotheatre.vn/Uploads/544986103_719061317803874_8033286584661339671_n.jpg'],
    start_time: null,
    price: 20, currency: 'USD',
  },
];

/** Ближайшая дата (завтра или позже), чей день недели есть в days */
function nextStartDate(days) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 9; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay() || 7;
    if (days.includes(dow)) return d.toISOString().slice(0, 10);
  }
  return new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
}

/** Программа по дням для лога/проверки (не в описание — оно уже готовое) */
function daysLabel(days) {
  return days.length === 7 ? 'ежедневно' : days.map((d) => W.ru[d - 1][0]).join(',');
}

/** Есть ли уже живое событие с таким website (постоянные шоу не дублируются) */
async function existingWebsites() {
  const { data, error } = await db.from('events').select('website').in('status', ['active', 'moderation']);
  if (error) {
    console.error('Ошибка чтения дублей:', error.message);
    return new Set();
  }
  return new Set((data || []).map((e) => e.website).filter(Boolean));
}

async function main() {
  const seen = await existingWebsites();
  let inserted = 0;

  for (const s of SHOWS) {
    if (seen.has(s.website)) {
      console.log(`  = уже есть: ${s.title}`);
      continue;
    }
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
      start_time: s.start_time,
      end_time: null,
      city: s.city,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      category_id: 'theatre',
      website: s.website,
      contact: null,
      photos: s.photos.slice(0, 3),
      price: s.price,
      currency: s.currency,
      donation: false,
      recurrence:
        s.days.length === 7 ? { freq: 'daily' } : { freq: 'weekly', days: s.days },
      status: 'moderation',
      source_type: 'theatre',
    };
    const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
    if (error) {
      console.error(`  Ошибка вставки «${s.title}»: ${error.message}`);
    } else {
      inserted++;
      seen.add(s.website);
      const rec = row.recurrence.freq === 'daily' ? 'ежедневно' : `weekly [${daysLabel(s.days)}]`;
      console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${s.title} | ${row.start_date} ${row.start_time || ''} | ${rec} | ${s.city} | show | ${s.currency} ${s.price ?? ''}`);
    }
  }
  console.log(`Готово: добавлено ${inserted}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
