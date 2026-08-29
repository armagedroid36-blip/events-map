// Сборщик «местных шоу для туристов»: постоянные представления, которые идут
// каждый день (расписание стабильное, парсить страницы не нужно — адреса и
// фото проверены вручную по страницам-источникам). События регулярные
// (recurrence daily, без end_date — архив их не трогает).
// Сейчас: VinWonders Nha Trang (Tata Show, Once Show), Дананг
// (Charming Danang Show, Ao Dai Show).
// Запускается в GitHub Actions после collect-bali.mjs; статус — «на модерации».
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const DRY_RUN = process.env.DRY_RUN === '1';

// Постоянные шоу: title (ru), title_en, описание (ru/en), город, ТОЧНЫЙ адрес,
// координаты, категория, website (стабильный ключ дедупликации), фото
// (проверены вручную: существуют и реально открываются).
const SHOWS = [
  {
    title: 'Tata Show в VinWonders',
    title_en: 'Tata Show at VinWonders',
    description:
      'Грандиозное цирковое шоу принцессы Таты: акробатика, трюки и спецэффекты. Ежедневно в парке VinWonders Nha Trang.',
    description_en:
      'The spectacular circus show of Princess Tata: acrobatics, stunts and special effects. Daily at VinWonders Nha Trang.',
    city: 'Нячанг',
    address: 'VinWonders Nha Trang, Hon Tre Island, Vinh Nguyen, Nha Trang',
    lat: 12.2186,
    lng: 109.241,
    website: 'https://vinwonders.com/en/tata-show/',
    photos: [
      'https://static.vinwonders.com/2022/05/Hinh-anh-VinWonders-Nha-Trang-Fairy-land-Tata-show-3x2-so-3.jpg',
      'https://static.vinwonders.com/2022/05/Hinh-anh-VinWonders-Nha-Trang-Fairy-land-Tata-show-3x2-so-12.jpg',
    ],
  },
  {
    title: 'Once Show в VinWonders',
    title_en: 'Once Show at VinWonders',
    description:
      'Мультимедийное шоу «Once»: танец, 3D-проекции на воду и музыку. Ежедневно в парке VinWonders Nha Trang.',
    description_en:
      'The "Once" multimedia show: dance, 3D water projections and music. Daily at VinWonders Nha Trang.',
    city: 'Нячанг',
    address: 'VinWonders Nha Trang, Hon Tre Island, Vinh Nguyen, Nha Trang',
    lat: 12.2186,
    lng: 109.241,
    website: 'https://vinwonders.com/en/once-show/',
    photos: [
      'https://static.vinwonders.com/2022/05/ONCE-SHOW-Water-Screen-Sorceress.jpg',
      'https://static.vinwonders.com/2022/05/ONCE-SHOW-Underwater-MEDIUM.jpg',
    ],
  },
  {
    title: 'Шоу Charming Danang в Дананге',
    title_en: 'Charming Danang Show',
    description:
      'Красочное вечернее шоу о культуре Вьетнама: аозай, конические шляпы, лотосы, музыка и танец. Ежедневно 19:30–20:40.',
    description_en:
      'A colorful evening show about Vietnamese culture: ao dai, conical hats, lotus flowers, music and dance. Daily 19:30–20:40.',
    city: 'Дананг',
    address: 'Culture House of Labor Da Nang, 2 Cach Mang Thang Tam, Hoa Cuong Nam, Hai Chau, Da Nang',
    lat: 16.0544,
    lng: 108.2022,
    website: 'https://danangfantasticity.com/en/art/charming-danang-show',
    photos: [
      'https://danangfantasticity.com/wp-content/uploads/2016/12/show-dien-da-nang-quyen-ru-19h30-20h40-hang-ngay-01.jpg',
      'https://danangfantasticity.com/wp-content/uploads/2016/12/show-dien-da-nang-quyen-ru-19h30-20h40-hang-ngay-02.jpg',
    ],
  },
  {
    title: 'Шоу Ao Dai в Дананге',
    title_en: 'Ao Dai Show Da Nang',
    description:
      'Театральное шоу об истории вьетнамского платья аозай: от прошлого к настоящему, династии, традиции и современность. Каждый вечер.',
    description_en:
      'A theatrical show about the history of the Vietnamese ao dai: from past to present, dynasties, traditions and modernity. Every night.',
    city: 'Дананг',
    address: 'Trung Vuong Theatre, 30 Tran Phu, Hai Chau, Da Nang',
    lat: 16.0644,
    lng: 108.2244,
    website: 'https://danangfantasticity.com/en/art/ao-dai-show-da-nang',
    photos: [
      'https://danangfantasticity.com/wp-content/uploads/2022/04/300-nam-ao-dai-ngu-than-xua-hoat-canh-cho-que.jpg',
      'https://danangfantasticity.com/wp-content/uploads/2022/04/ao-dai-nu-sinh-viet-nam-1024x576.jpg',
    ],
  },
];

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
      // Первая дата — завтра (событие идёт ежедневно, бессрочно)
      start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      end_date: null,
      start_time: null,
      end_time: null,
      city: s.city,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      category_id: 'show',
      website: s.website,
      contact: null,
      photos: s.photos.slice(0, 3),
      price: null,
      currency: null,
      donation: false,
      // Ежедневное представление без даты окончания — архив его не тронет
      recurrence: { freq: 'daily' },
      status: 'moderation',
    };
    const { error } = DRY_RUN ? { error: null } : await db.from('events').insert(row);
    if (error) {
      console.error(`  Ошибка вставки «${s.title}»: ${error.message}`);
    } else {
      inserted++;
      seen.add(s.website);
      console.log(`  ${DRY_RUN ? '[dry] +' : '+'} ${s.title} | ${row.start_date} | ежедневно | ${s.city} | show`);
    }
  }

  console.log(`Готово: добавлено ${inserted}.`);
}

main().catch((e) => {
  console.error('Критическая ошибка:', e.message);
  process.exit(1);
});
