// Страницы Cyprus Now, которые дублируют УЖЕ собранное событие.
//
// Лента CN держит на одно событие две записи под разными слагами (греческий и
// английский, либо слаг вообще от другого события). Ни ключ `title|start_date`,
// ни множество `website` такую пару не ловят: слаги разные, у второй записи
// своя дата и своё название. Первая карточка уже на карте, и без этого списка
// сборщик на следующем прогоне вставит вторую — «одно событие, две карточки».
//
// Каждая запись: slug страницы-дубля (без домена) -> { keep, why }.
//   keep — ссылка на карточку-эталон, которая уже собрана и остаётся на карте;
//   why  — цитата/факт источника, доказывающий, что это одно и то же событие.
export const CN_DUPLICATE_SLUGS = new Map([
  [
    'official-nicosia-christmas-market-2026-2026-12-19',
    {
      keep: 'https://cyprusnow.app/event/limassol-christmas-show-festive-magic-at-st-george-havouzas-2026-12-12',
      why:
        'одно событие «Limassol Christmas Show / Η Μαγεία των Χριστουγέννων»: ' +
        'двор церкви Αγίου Γεωργίου Χαβούζα, Лимасол, 34.6941201,33.0150894, ' +
        '12–13 и 19–20.12.2026 (обе записи ленты дают ту же точку площадки до 7-го знака; ' +
        'в описаниях обеих — те же четыре дня; у дубля слаг и название от другой афиши)',
    },
  ],
  [
    // Агрегатор ПЕРЕНЁС вечер и переименовал страницу: старый слаг
    // `jepe-at-dusty-munky-2026-10-16` отдаёт 308 → эта страница. Событие уже
    // собрано через cyprus.bz (та же точка площадки Dusty Munky, 17.10 20:00),
    // поэтому CN-страница карточку не создаёт.
    'jepe-diynamic-eastern-standard-2026-10-17',
    {
      keep: 'https://cyprus.bz/ru/event/3480/jepe-diynamic-get-physical-2026',
      why:
        'один вечер Jepe в Dusty Munky (Лимасол): cyprus.bz /event/3480 даёт ту же точку ' +
        'площадки 34.6796979,33.0461632 и ту же дату 17.10.2026 20:00; лента CN держит ' +
        'на пятницу 16.10 другое событие зала (Lubimaya – ION), а старый слаг карточки ' +
        'этой же записи 308-редиректит на этот',
    },
  ],
  [
    // Тот же класс, найденный зондом редиректов: страница переименована
    // (`mochakk-at-mason-2026-10-17` → 308 → эта), событие и день те же —
    // карточка уже на карте, сборщик по новому URL создал бы вторую.
    'mochakk-calling-2026-10-17',
    {
      keep: 'https://cyprusnow.app/event/mochakk-calling-2026-10-17',
      why:
        'один вечер Mochakk в Mason Bar (Лимасол), 17.10.2026: старая страница карточки ' +
        'отдаёт 308 на эту, запись ленты та же одна (start_at 17.10T17:30Z, venue Mason Bar ' +
        '34.6732015,33.0429902, описание «GO LOCO presents Mochakk in Limassol»)',
    },
  ],
  [
    // Тот же класс, зонд редиректов 23.10.2026: страница карточки 247711b7
    // (`open-sports-festival-2026-corporate-sports-networking-in-limassol-2026-10-17`)
    // отдаёт 308 на каноническую страницу главного дня 24.10 — событие 17.10 прошло,
    // карточка ушла в архив, канонический день собран отдельной живой карточкой (4d56fe67).
    'open-sports-festival-2026-corporate-sports-networking-in-limassol-2026-10-17',
    {
      keep: 'https://cyprusnow.app/event/open-sports-festival-2026-24-10-2026-2026-10-24',
      why:
        'Open Sports Festival в Heritage Private School (Лимасол): старая страница 17.10 ' +
        '308-редиректит на страницу 24.10 (та уже собрана карточкой 4d56fe67), ' +
        'точка школы 34.7379547,32.9886421 та же; карточка 17.10 архивирована',
    },
  ],
  [
    // Класс «две записи ленты на один вечер, разные слаги» (25.10.2026): карточка
    // 19cb512b уже стоит на карте по канонической записи `...-in-nicosia-...`
    // (зал Eleftheria Indoor Arena, 35.14748,33.3119735, 19:30–21:30). Запись
    // `...-at-eleftheria-arena-...` — второй слаг того же вечера: JSON-LD самой
    // страницы даёт startDate 2026-11-10T19:30:00+02:00 и venue «Eleftheria Square»
    // (центровой фолбэк вместо зала), поэтому собранная по ней карточка 6f07b75c
    // печатала 17:30 и площадь — архивирована.
    'john-cleese-last-time-to-see-me-before-i-die-at-eleftheria-arena-2026-11-10',
    {
      keep: 'https://cyprusnow.app/event/john-cleese-last-time-to-see-me-before-i-die-in-nicosia-2026-11-10',
      why:
        'один вечер John Cleese 10.11.2026: запись ленты `...-in-nicosia-...` ' +
        'start_at 17:30Z = 19:30 местного, venue Tassos Papadopoulos – Eleftheria Indoor Arena ' +
        '(Engomi, 35.14748,33.3119735) — карточка 19cb512b active; у второго слага ' +
        'JSON-LD той же даты 19:30+02:00, но venue «Eleftheria Square» (фолбэк)',
    },
  ],
]);

// Принимает ссылку страницы или слаг, возвращает запись о дубле либо null.
export function cnDuplicateOf(pageUrlOrSlug) {
  const raw = String(pageUrlOrSlug || '').trim();
  if (!raw) return null;
  const slug = raw.replace(/^https?:\/\/[^/]+\/event\//, '').replace(/[/?#].*$/, '');
  return CN_DUPLICATE_SLUGS.get(slug) || null;
}
