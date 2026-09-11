// Реестр источников театрального сбора. Общий модуль: используется сборщиком
// scripts/collect-theatres.mjs (обход) и разведчиком scripts/theatre-scout.mjs
// (проверка живости уже одобренных источников).
//
// kind: 'schedule' — страница одного шоу/расписания (её URL может служить ключом
// дедупликации), 'listing' — страница со списком разных шоу (URL ключом быть не
// может: он схлопнет все карточки в одну).
//
// Проверено и СОЗНАТЕЛЬНО не используется (чтобы не выдумывать данные):
// - nagikubalitour.com/dance-performance-schedule-ubud — 200, но расписание в
//   блоге без подтверждённых площадок: LLM извлёк 0 событий;
// - vinwonders.com/en/shows/ — 0 событий (общая страница парка);
// - vinwonders.com/en/once-show/ — НЕ используется: страница описывает Once Show
//   в VinWonders PHU QUOC («Fire Phoenix Square, 18:45 - 19:05 every day»), а не
//   нячангскую карточку; цены на странице нет — шоу включено в билет парка;
// - vinwonders.com/en/tata-show/ — ДОБАВЛЕН: страница прямо указывает
//   «Luminary Square, VinWonders Nha Trang 19:30 - 20:10, included in admission
//   ticket» (проверено 11.09.26) — из неё дозаполняется время карточки Tata Show;
//   цены нет (входит в билет парка), поэтому price карточки остаётся пустым;
// - balerungbali.com, waterpuppetnhatrang.com — домены не резолвятся;
// - ubudcommunity.com, balispirit.com — JS-челлендж Cloudflare/бот-стена (202);
// - nowbali.co.id/events/, thebalibible.com/events/, bali.com/events/ — 404.
export const SOURCES = [
  {
    name: 'Ubud Center — расписание танцев Убуда',
    url: 'https://www.ubudcenter.com/ubud-things-to-do/',
    city: 'Убуд, Bali', country: 'Indonesia', tzMin: 480, kind: 'listing',
  },
  {
    name: 'Uluwatu Temple — Kecak Fire Dance',
    url: 'https://uluwatutemple.id/uluwatu-kecak-dance',
    city: 'Улувату, Bali', country: 'Indonesia', tzMin: 480, kind: 'schedule',
  },
  {
    name: 'Devdan Show — Bali Nusa Dua Theatre',
    url: 'https://devdanshow.com/',
    city: 'Нуса-Дуа, Bali', country: 'Indonesia', tzMin: 480, kind: 'schedule',
  },
  {
    name: 'Đó Theatre / Life Puppets — Нячанг',
    url: 'https://dotheatre.vn/en/home',
    city: 'Нячанг', country: 'Vietnam', tzMin: 420, kind: 'listing',
  },
  {
    name: 'VinWonders Nha Trang — Tata Show',
    url: 'https://vinwonders.com/en/tata-show/',
    city: 'Нячанг', country: 'Vietnam', tzMin: 420, kind: 'schedule',
  },
  {
    name: 'Da Nang Fantasticity — Charming Danang Show',
    url: 'https://danangfantasticity.com/en/art/charming-danang-show',
    city: 'Дананг', country: 'Vietnam', tzMin: 420, kind: 'schedule',
  },
  {
    name: 'Da Nang Fantasticity — Ao Dai Show',
    url: 'https://danangfantasticity.com/en/art/ao-dai-show-da-nang',
    city: 'Дананг', country: 'Vietnam', tzMin: 420, kind: 'schedule',
  },
];
