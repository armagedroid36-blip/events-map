// dot-cy-cross-source-dupe-archive.mjs — ремонт класса «одно событие собрано разными источниками →
// несколько меток на одной точке» (кипрские пары, подтверждённые данными запуска 112).
// Ключ дедупа `title|start_date` их не склеивает: названия у источников разные.
// Оставляем карточку с более полными данными (адрес площадки, описание в двух языках, фото),
// слабейшую — в архив. Архив — не удаление (штатный dedupe-events.mjs делает то же).
// Страховки: обе карточки active, одна дата, одно время, точки в пределах 0.0015°, у обеих
// заголовок содержит общий смысловой токен, разные website. DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
// Центровые фолбэки городов Кипра (сборщик ставит их, когда у источника нет площадки).
const CENTER_FALLBACKS = [
  [34.7071, 33.0226], // Лимасол
  [34.9182, 33.6194], // Ларнака
  [35.1856, 33.3823], // Никосия
  [34.7754, 32.4245], // Пафос
  [35.0375, 34.0041], // Ая-Напа
  [35.1167, 33.9432], // Фамагуста
];
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const PAIRS = [
  {
    keep: 'b80afec6', archive: 'c4a495ba', token: /viennese\s*waltz/i,
    note: 'Viennese Waltzes 21.11 Пафос 20:30, Markideio Theatre: cyprus.bz (3 фото, 295 знаков описания, end_date) vs cyprusnow (1 фото, 125 знаков)',
  },
  {
    keep: 'd41899dd', archive: 'b8274fc9', token: /bi-?2/i,
    note: 'BI-2 24.10 Лимасол 20:00, 34.66221,33.019275 (Тсифликудион/ETKO): cyprus.bz (описание ru+en, 3 фото, end_date) vs cyprusnow (заголовок с мусорным хвостом «Check out all the events…»)',
  },
  {
    keep: 'e6352769', archive: 'e01fbad6', token: /(lone|one)\s*shoe|παπο[yú]/i,
    note: 'The Lone/One Shoe 08.11 Никосия 10:30, 35.1680107,33.3146209 (Amphitheatre of the Cyprus Institute of Neurology and Genetics): cyprusnow (583 знака, перевод ru+en, точное имя площадки) vs cyprus.bz (296 знаков, описание дублирует заголовок)',
  },
  {
    keep: 'b10ba6d1', archive: 'a593accd', token: /spartacus|спартак/i,
    note: 'Spartacus Ballet 27.11 Никосия 19:30, 35.1726381,33.3550588 (Nicosia Municipal Theatre): cyprus.bz (адрес площадки «Nicosia Municipal Theatre, Nicosia», полное описание 600+ знаков, 3 фото) vs cyprusnow (адрес уровня тура «Nicosia Municipal Theatre/ Pattihio Theatre Limassol», описание со служебным хвостом «Scroll down for English version», 1 фото)',
  },
  {
    keep: 'ed200c34', archive: '09a142aa', token: /(jack|beanstalk|τζακ|φασολ|fasolia)/i,
    note: 'Jack and the Beanstalk 14.11 Никосия 11:00, Latsia Theatre (35.1063639,33.3782668): cyprus.bz (slug /event/3578/jack-and-the-beanstalk-2026 — греч. название «O Tzak Kai I Fasolia», 3 фото) vs cyprusnow (1 фото) — одна постановка, разные языковые названия источника',
  },
  {
    keep: '5f0a1b94', archive: '0ac76029', token: /scalifornia/i,
    note: 'Scalifornia 10.10 Ларнака 11:00, Salina Municipal Park (34.916,33.625): cyprus.bz (slug /event/3233/scalifornia-a-food-festival-2026, 3 фото) vs cyprusnow (1 фото)',
  },
  {
    keep: '4de25efe', archive: '268e5e70', token: /2sides/i,
    note: '2Sides 09.10 Лимасол 20:00, Dusty Munky (34.680,33.046): cyprusnow «2Sides at Dusty Munky» vs cyprusnow «2SIDES LIMASSOL» — два слага одной страницы источника, названия разошлись',
  },
  {
    keep: 'a3d16f5f', archive: '1685ff91', token: /samael/i,
    note: 'Samael 13.11 Никосия 20:00, DownTown Live (35.165,33.350): cyprusnow (адрес площадки «DownTown Live») vs cyprus.bz (адрес «DownTown Live, Limassol» — ложный город источника внутри никосийской карточки)',
  },
  {
    // подкласс «два слага ОДНОЙ страницы источника»: website совпадает, поэтому штатная страховка
    // «разные website» заменяется явным ожиданием этой страницы у обеих карточек.
    keep: '1c5a27ba', archive: 'bc52f4e4', token: /halloween/i, sameSite: true,
    website: 'https://cyprusnow.app/event/halloween-extravaganza-drag-show-dj-night-in-limassol-2026-10-30',
    note: 'Halloween Extravaganza 30.10 Лимасол 21:00, Rooftop Bar at Limassol Agora (34.6761,33.0434): оставляю cyprusnow-слаг с адресом площадки и переводом ru+en (1 фото), архив — карточка того же события с адресом «Limassol Agora» и описанием без перевода (1 фото)',
  },
  {
    // подкласс «одна страница источника, ДВЕ карточки с разными временем»: страница обновилась,
    // одна карточка осталась со старыми данными. Арбитр — JSON-LD страницы (`source`): оставляем
    // ту карточку, что совпадает с источником, устаревшую — в архив.
    keep: '9c9a2952', archive: '3da16852', token: /kazanias/i, sameSite: true,
    website: 'https://cyprusnow.app/event/grape-harvest-festival-2026-08-16',
    source: { start_date: '2026-10-25', start_time: '18:00:00' },
    note: 'Festival "Kazaniasmata" 25.10 Arsos Village Square (34.8409,32.7691): страница даёт 18:00-21:00; оставляю карточку с адресом «Arsos Village Square» (18:00), архив — «Kazaniasmata Festival 2026 @ Arsos» с устаревшим временем 17:00 и адресом уровня города «Лимасол, Кипр»',
  },
  {
    keep: '9a506e8a', archive: 'b3ca7316', token: /lotus\s*parable/i, sameSite: true,
    website: 'https://cyprusnow.app/event/lotus-parable-2026-10-17',
    source: { start_date: '2026-10-17', start_time: '20:30:00' },
    note: 'Lotus Parable 17.10 Лимасол: страница даёт 20:30-11:00 без площадки; оставляю «Lotus Parable – Label Night» (20:30, title источника), архив — «Lotus Parable» с временем 22:00 и площадкой «Sacred Garden», которой на странице источника НЕТ (не подтверждается)',
  },
  {
    keep: '36a87826', archive: '7db533dc', token: /cultural\s*fe?s?tival/i, sameSite: true,
    website: 'https://cyprusnow.app/event/cultural-festival-2026-10-09',
    source: { start_date: '2026-10-10', start_time: '15:30:00' },
    note: 'Cultural Festival 10.10 Klirou Village Square (35.0213564,33.1777225): страница даёт 10.10 15:30; оставляю карточку с этой датой, архив — карточка с устаревшей датой 09.10 18:00 (та же точка и адрес)',
  },
  {
    keep: '007d21be', archive: '3312ee32', token: /comic\s*con/i,
    note: 'Comic Con / Halloween 31.10 Никосия 12:00-21:00, Mall of Engomi: cyprus.bz (страница /event/35b5, 3 фото, название «Halloween in the World of Comics. Comic Con 2026», JSON-LD 10:00-19:00Z = 12:00-21:00 EET) vs cyprusnow (1 фото, «NecroComicCon 2026: Halloween at Mall of Engomi», JSON-LD 12:00-21:00+02:00) — та же площадка, та же дата и часы; страница cyprus.bz сама упоминает NecroComicCon',
  },
  {
    keep: '2627b94c', archive: '7abd838b', token: /aglanjazz/i,
    note: 'AglanJazz Festival 2026 10.10 Никосия 19:00, Skali Amphitheatre (Aglantzia): две записи одного фестиваля в ленте cyprusnow (разные слаги, JSON-LD обеих 2026-10-10T19:00+03:00); оставляю карточку с адресом «Skali Amphitheatre, Aglantzia», архив — «AglanJazz Festival 2026: Live Jazz Night in Nicosia» с адресом «Skali Aglantzas»',
  },
  {
    keep: '4cf5d3f2', archive: '2a81f375', token: /christmas\s*village/i,
    note: 'Рождественская деревня Калопанайотиса 21.11.2026-06.01.2027, 34.993,32.830: cyprus.bz (3 фото, адрес «Fairytale Christmas Village Kalopanayiotis», JSON-LD 21.11 11:00 местного) vs cyprusnow (1 фото, «Kalopanagiotis Christmas Village 2026: Programme & Dates», JSON-LD 21.11 11:00+02:00) — одна сезонная площадка, два источника',
  },
  {
    // подкласс «одно событие — ДВА слага ОДНОГО источника в разных городах»: cyprusnow держит
    // две страницы одного события, одна помечена Лимасолом (20:30), другая — Никосией (18:00),
    // поэтому карточки стоят в РАЗНЫХ городах и на разных центровых фолбэках. Арбитр — третьи
    // источники: RA (20:30-11:30, venue TBA), rave-pulse (страница события в разделе Limassol),
    // lima.events (20:30, Tba) → верны 20:30 и Лимасол; площадка у события TBA, пин остаётся центровым.
    keep: '9a506e8a', archive: '33fb1c5f', token: /lotus\s*parable/i,
    source: { start_date: '2026-10-17', start_time: '20:30:00' },
    note: 'Lotus Parable Label Night 17.10: страница /event/lotus-parable-2026-10-17 (Лимасол 20:30) оставлена, архив — /event/lotus-parable-label-night-outdoor-techno-gathering-in-cyprus-2026-10-17 (Никосия 18:00, центр Никосии 35.1856,33.3823) — тот же лейбл-найт, разные город и время у одного источника',
  },
  {
    // тот же подкласс «одно событие — два слага одного источника в разных городах» (запуск 120).
    // Оставляю карточку с реальной площадкой и её 7-значной точкой, архив — карточку, стоящую
    // на центровом фолбэке Никосии (35.1856,33.3823).
    keep: '98f22ee1', archive: '9dd8aba3', token: /social\s*frqns/i, citySplit: true,
    source: { start_date: '2026-10-24', start_time: '18:00:00' },
    note: 'Social FRQNS 24.10 18:00 Никосия: страница /event/social-frqns-2026-10-24 (площадка «Nonna Rosa, Pizeria», 35.1692541,33.3597735) оставлена; архив — /event/social-frqns-the-one-at-the-pizzeria-2026-10-24 («the Pizzeria», точка = центр Никосии) — тот же вечер двумя страницами источника',
  },
  {
    // и ещё одна пара того же подкласса: у источника две страницы гонки, одна помечена Лимасолом
    // и стоит РОВНО на центровом фолбэке Лимасола (34.6786322,33.0413055), вторая — деревня
    // Камбос округа Никосии с реальной 7-значной точкой и временем окончания.
    keep: 'e8437c73', archive: 'e3ca9a17', token: /kambos\s*mountain/i, citySplit: true,
    source: { start_date: '2027-01-17', start_time: '07:00:00' },
    note: 'Kambos Mountain Race 2027 17.01 07:00: страница /event/kambos-mountain-race-2027-trail-running-in-nicosia-2027-01-17 (Green Kampos, 35.0392022,32.7324144, end 15:00) оставлена; архив — /event/kambos-mountain-race-2027-trail-running-challenge-in-cyprus-2027-01-17 (метка «Лимасол» и пин на центре Лимасола, end_date нет)',
  },
  {
    // тот же подкласс: у источника две страницы забега — латинская (с площадкой) и греческая
    // (на центровом пине Никосии).
    keep: '2079c478', archive: '5ba6bf21', token: /run\s*as\s*one/i, citySplit: true,
    source: { start_date: '2026-10-18', start_time: '07:30:00' },
    note: 'Alphamega Run as One 2026 18.10 07:30: страница /event/alphamega-run-as-one-2026-half-marathon-fun-run-in-nicosia-2026-10-18 (Alphamega Hypermarket Engomi, 35.1628227,33.3318634) оставлена; архив — /event/αλφαμεγα-run-as-one-2026-2026-10-18 (греческое написание, пин = центр Никосии)',
  },
  {
    // тот же подкласс: латинский слаг с площадкой vs греческий слаг с центровым пином.
    keep: '4099ed37', archive: '01d1be53', token: /kids\s*festival/i, citySplit: true,
    source: { start_date: '2026-10-18', start_time: '10:00:00' },
    note: 'Nicosia Kids Festival (2-е издание) 18.10 10:00: страница /event/nicosia-kids-festival-2nd-edition-free-family-festival-in-nicosia-2026-10-18 (Old GSP Park, 35.1684711,33.3566973) оставлена; архив — /event/2ο-nicosia-kids-festival-…-2026-10-18 (греческая страница, адрес это перечень мест, пин = центр Никосии)',
  },
  {
    // подкласс «одно событие — латинский и греческий слаг источника, разные пин и адрес» (запуск 121):
    // латинская страница даёт площадку «Central Square of Acheritou», греческая — только город.
    keep: '8030fb70', archive: '12076f2e', token: /(παγκ|pan.?cypriot)/i, cityAddr: true,
    source: { start_date: '2026-10-09', start_time: '19:00:00' },
    note: '4-й Паγκипрский летний культурный фестиваль 09.10 19:00 Фамагуста: страница /event/4th-pan-cypriot-summer-cultural-festival-in-famagusta-2026-10-09 (Central Square of Acheritou, 35.0996644,33.8613357) оставлена; архив — /event/4o-παγκύπριο-πολιτιστικό-φεστιβάλ-θέρους-2026-10-09 (греческий слаг, адрес уровня города «Фамагуста, Кипр», пин 35.139128,33.8478462)',
  },
  {
    // подкласс «одно событие — два слага источника, разные пины» (запуск 122) — здесь на самом
    // деле ТРИ живые карточки одного шоу (cyprus.bz + два слага cyprusnow) на 14.11 16:00.
    // Арбитр — OSM: Θέατρο Μασκαρίνι (way 1047395017), 4 Athalassis, Агландзия/Латсия, округ
    // Никосии — 35.1188618,33.3780548. Ровно на этой точке стоит карточка cyprus.bz (`08fdfad2`,
    // полное описание + фото); слаг cyprusnow «…bubble-theatre-for-kids-in-nicosia…» в 70 м
    // (8969bb4b), слаг «…soap-bubble-show-in-nicosia-larnaca…» — в 2.1 км (317cdd54) → оба в архив.
    keep: '08fdfad2', archive: '317cdd54', token: /bubble/i,
    osmPin: { lat: 35.1188618, lng: 33.3780548, tol: 0.0005 },
    note: 'Mr and Mrs Bubble Show 14.11 16:00 Никосия: оставлена карточка cyprus.bz /event/30b5/… (пин ровно на точке OSM «Θέατρο Μασκαρίνι», адрес «Theatro Maskarini, Nicosia», фото, полное EN-описание); архив — слаг cyprusnow «…soap-bubble-show-in-nicosia-larnaca…» (адрес «Theatro Maskarini», пин 35.0995648,33.3815988 — 2.1 км мимо площадки)',
  },
  {
    keep: '08fdfad2', archive: '8969bb4b', token: /bubble/i,
    osmPin: { lat: 35.1188618, lng: 33.3780548, tol: 0.0005 },
    note: 'то же шоу, вторая копия того же класса: архив — слаг cyprusnow «…bubble-theatre-for-kids-in-nicosia…» (пин 35.1186931,33.3787897 — 70 м от площадки OSM, греческое описание со служебным хвостом «Scroll down for English version», 1 фото)',
  },
  {
    // подкласс «одно событие — два слага источника, РАЗНЫЕ пины» (запуск 123). Третий источник —
    // eventshub.cy (страница организатора Louis Patsalides): «20 Χρόνια Stand Up Comedy στη Λευκωσία»
    // → Κινηματοθέατρο Παλλάς, Rigenis 24, Λευκωσία. OSM/Nominatim даёт ту же площадку
    // (35.1731528,33.3576336): карточка с пином в 24 м — оставляем, вторая («Sonhe Bar», 1.5 км) — архив.
    keep: '3754bb3d', archive: '5f0716ef', token: /(patsalidis|πατσαλ|stand\s*up)/i,
    osmPin: { lat: 35.1731528, lng: 33.3576336, tol: 0.0005 },
    note: 'Louis Patsalidis «20 χρόνια Stand Up Comedy» 23.10 21:00 Никосия: оставлена карточка /event/louis-patsalidis-20-years-of-stand-up-comedy-live-in-cyprus-2026-10-23 (PALLAS THEATRE NICOSIA, 35.1730032,33.3574477 — 24 м от точки OSM, end_date 25.10 = тур из трёх городов); архив — /event/20-χρόνια-stand-up-comedy-2026-10-23 (площадка «Sonhe Bar», 35.1608518,33.3692247 — 1.5 км от театра, третьим источником не подтверждается)',
  },
  {
    // подкласс «одно событие — латинский и греческий слаг источника, разные пин и адрес» (запуск 126).
    // Латинская страница /event/2nd-music-festival-municipality-of-paralimni-deryneia-2026-10-13 несёт
    // площадку «Around the Paralimni-Deryneia district» (JSON-LD 2026-10-13T20:00+03:00); греческая
    // /event/φεστιβάλ-μουσικής…-2026-08-25 — та же дата и время, но площадки нет (location = Famagusta),
    // поэтому карточка стоит на центровом фолбэке Фамагусты с адресом «Фамагуста, Кипр».
    keep: 'c2b11c4a', archive: 'ed17b27b', token: /(music\s*fe?s?tival|μουσικ)/i, cityAddr: true,
    source: { start_date: '2026-10-13', start_time: '20:00:00' },
    note: '2nd Music Festival – Municipality of Paralimni – Deryneia 13.10 20:00 Фамагуста: оставлена англ. страница (площадка «Around the Paralimni-Deryneia district», пин 35.062854,33.960628); архив — греческий слаг (адрес уровня города «Фамагуста, Кипр», пин = центр Фамагусты 35.139128,33.8478462) — одно событие двумя страницами одного источника',
  },
  {
    // подкласс «одно событие — два слага источника, слабый пин + адрес уровня города» (запуск 127).
    // Nicosia Book Fest 2026 (10–11.10, Πάρκο Ακροπόλεως): у оставляемой карточки адрес «Caves of
    // Acropolis Park» и пин площадки фестиваля 35.1464346,33.3615795 (та же точка, что у живой
    // канон-карточки 10.10 и у ленты CN «?q=book fest»); у архивируемой адрес «Никосия, Кипр» и
    // центровой фолбэк Никосии. Обе страницы слагов теперь 404 (источник их снял), а API CN по
    // «book fest»/«παράθυρα»/«βιβλίων» отдаёт только одну запись фестиваля — второго события нет.
    keep: '6c026f18', archive: 'fc6cd23d', token: /(book|βιβλ)/i, cityAddr: true,
    source: { start_date: '2026-10-11', start_time: '10:00:00' },
    note: 'Nicosia Book Fest 2026 11.10 10:00 Никосия: оставлена «Nicosia Book Fest 2026 – Παγκόσμια Ημέρα Βιβλίου» (адрес «Caves of Acropolis Park», пин площадки фестиваля 35.1464346,33.3615795); архив — «Τα βιβλία είναι παράθυρα, καθρέφτες και πόρτες στον κόσμο» (адрес уровня города «Никосия, Кипр», пин = центр Никосии 35.1856,33.3823)',
  },
  {
    // подкласс «одно событие — две страницы источника, одна датирована финальным днём» (запуск 128).
    // 16-й Международный фестиваль короткометражных фильмов Кипра идёт 10–16.10.2026 (Rialto Theatre,
    // Лимасол). Английская страница /event/international-short-film-festival-2026-2026-10-10 даёт
    // JSON-LD 2026-10-10T20:00 → 2026-10-16T23:00 (полный интервал, описание «From October 10-16…»);
    // греческая /event/16ο-…-2026-10-10 — та же площадка и то же событие, но JSON-LD 2026-10-16T20:00 →
    // 23:00 (только финальный день), при том что её описание прямо говорит «από τις 10 έως τις 16
    // Οκτωβρίου 2026». Интервал архивируемой целиком внутри интервала оставляемой → это дубль.
    keep: 'a4eedb5c', archive: 'c473b13c', token: /(short\s*film|φεστιβαλ|фестивал)/i,
    windowInside: true, venue: 'rialto',
    source: { start_date: '2026-10-10', start_time: '20:00:00', end_date: '2026-10-16' },
    setEnd: { end_date: '2026-10-16', end_time: '23:00:00' },
    note: 'International Short Film Festival 2026 10–16.10 Лимасол, Rialto Theatre (34.679538,33.0458112): оставлена англ. карточка «International Short Film Festival 2026» (start 10.10 20:00 = startDate источника; ей проставлен end_date 16.10 23:00 из JSON-LD); архив — греческая «16ο ΔΙΕΘΝΕΣ ΦΕΣΤΙΒΑΛ ΤΑΙΝΙΩΝ ΜΙΚΡΟΥ ΜΗΚΟΥΣ ΚΥΠΡΟΥ» (start 16.10 20:00 — только финальный день того же фестиваля)',
  },
  {
    // подкласс «одно событие — две страницы источника» (запуск 129). Nicosia Book Fest 2026 идёт
    // 10–11.10 в Πάρκο Ακροπόλεως (Никосия). В базе две живые карточки одного фестиваля: англ.
    // «…Free Book & Literature Festival» (start 10.10 = первый день, end 11.10, адрес «Akropolis Park»)
    // и греч. «…Παγκόσμια Ημέρα Βιβλίου» (start 11.10, адрес «Caves of Acropolis Park», описание —
    // анонс/прессрелиз о фестивале). Проверено 09.10.2026 через прокси 10809: греческий слаг отдаёт
    // 308 Permanent Redirect на англ. слаг (канон), англ. страница 200 и живая; API CN «?q=book fest»
    // возвращает РОВНО одну запись с тем же каноническим слагом (title «…10-11/10/26 | Πάρκο Ακρόπολης»).
    // Пин и город у карточек совпадают, интервал архивируемой (11.10) внутри интервала оставляемой (10–11.10).
    keep: 'd3a4c641', archive: '6c026f18', token: /(book|βιβλ)/i,
    windowInside: true, venue: 'ropolis|ακροπόλ',
    source: { start_date: '2026-10-10', start_time: '10:00:00', end_date: '2026-10-11' },
    note: 'Nicosia Book Fest 2026 10–11.10 Никосия, Πάρκο Ακροπόλεως (35.1464346,33.3615795): оставлена англ. карточка «Nicosia Book Fest 2026: Free Book & Literature Festival» (start 10.10 10:00, end 11.10 22:00, адрес «Akropolis Park», канонический живой слаг источника); архив — греческая «Nicosia Book Fest 2026 – Παγκόσμια Ημέρα Βιβλίου» (start 11.10 — только финальный день того же фестиваля; её слаг 308-редиректит на канон)',
  },
  {
    // подкласс «одно событие — две страницы источника, архивируемая датирована финальным днём» (запуск 130).
    // Wellness Retreat '26 (уикенд 23–24.10, Aelia Wellness Retreat, Никосия): у источника ДВЕ живые страницы
    // одного и того же события — канонический слаг `…aelia-nicosia-2026-10-23` даёт JSON-LD
    // startDate 2026-10-23T09:00+03:00 / endDate 2026-10-24T17:00+03:00 (весь уикенд), а слаг с двойной
    // датой `…2026-10-23-2026-10-24` — только startDate 2026-10-24T09:00 (финальный день, без endDate).
    // Проверено 09.10.2026 через прокси 10809: обе страницы 200 (306 и 309 КБ), название у обеих одно.
    keep: '4e20045e', archive: '8fa34b89', token: /wellness/i,
    windowInside: true, venue: 'aelia',
    source: { start_date: '2026-10-23', start_time: '09:00:00', end_date: '2026-10-24' },
    note: 'Wellness Retreat 26 (Women’s Wellness Weekend) 23–24.10 Никосия, Aelia Wellness Retreat (35.0273355,33.3058124): оставлена карточка с каноническим слагом и полным интервалом 23.10 09:00 → 24.10 17:00; архив — карточка того же события со слагом финального дня и start_date 24.10 09:00',
  },
  {
    // тот же подкласс (запуск 130), театральная постановка двумя вечерами: канонический слаг
    // `…-2026-11-09` даёт JSON-LD startDate 09.11 20:30 / endDate 10.11 20:30 (оба вечера, одна
    // страница = одно событие), слаг `…-2026-11-10` — только startDate 10.11 20:30 (второй вечер).
    // Проверено 09.10.2026 через прокси 10809: обе страницы 200 (288 и 290 КБ), адрес площадки
    // «Γενεθλίου Μιτέλλα 34» (Palio Xidadiko, Лимасол) один и тот же.
    keep: '5ed3ad05', archive: '9a816063', token: /ανακουτρεύκω/i,
    windowInside: true, venue: 'xidadiko',
    source: { start_date: '2026-11-09', start_time: '20:30:00', end_date: '2026-11-10' },
    note: 'Ανακουτρεύκω στη Λεμεσό 09–10.11 Лимасол, Palio Xidadiko (34.6732045,33.0436665): оставлена карточка канонического слага с интервалом 09.11 20:30 → 10.11 20:30; архив — карточка слага второго вечера (start 10.11 20:30)',
  },
  {
    // подкласс «карточка СЕРИИ с недельным повтором + карточка последнего дня серии» (канал collect-tg):
    // у оставляемой задана recurrence (weekly), её end_date = дата архивируемой, время начала/окончания,
    // площадка и пин совпадают → архивируемая — то же последнее занятие, а не новое событие.
    keep: '0b4951f8', archive: '98859e2b', token: /archery\s*tag|лучн/i,
    seriesLastDay: true, venue: 'gamezone',
    note: 'Archery Tag Нячанг, GameZone (12.3007872,109.2072767): оставлена карточка недельной серии 03–10.10 16:30–18:00 (post 24058, recurrence weekly), архив — напоминание о последнем занятии 10.10 16:30–18:00 (post 24318)',
  },
  {
    // тот же подкласс «финальный день многодневного» (запуск 132), источник — Cyprus Now:
    // Lefkara Classic идёт 12–15.11.2026 (велогонка-бревет + фестиваль, The Agora Hotel, Пано Лефкара).
    // Лента отдаёт ДВЕ записи одного события: каноническая `lefkara-classic-2026-15-11-2026-2026-11-15`
    // → start_at 2026-11-12T14:00Z (=16:00 местного) / end_at 2026-11-15T15:00Z (=17:00), и
    // `lefkara-classic-endurance-cycling-challenge-in-lefkara-2026-11-15` → только 2026-11-15T04:30Z
    // (=06:30), финальный день. Проверено 09.10.2026 через прокси 10809: API `?q=lefkara` отдаёт обе
    // записи, площадка у обеих «The Agora Hotel».
    keep: '3845e750', archive: '3a8400bb', token: /lefkara/i,
    windowInside: true, venue: 'agora',
    source: { start_date: '2026-11-12', start_time: '16:00:00', end_date: '2026-11-15' },
    note: 'Lefkara Classic 12–15.11.2026 Ларнака, Пано Лефкара (34.8665517,33.3068524): оставлена карточка полного интервала 12.11 16:00 → 15.11 17:00 (адрес «The Agora Hotel / Pano Lefkara Square», сайт lefkaraclassic.com); архив — карточка того же события, датированная только финальным днём 15.11 06:30',
  },
  {
    // тот же подкласс «финальный день многодневного» (запуск 133), источник — Cyprus Now.
    // Проверено 09.10.2026 через прокси 10809: API `?q=melancholia` отдаёт ДВЕ записи с ОДНИМ названием
    // и одной площадкой («Nicosia Municipal Theatre») — каноническая `…-2026-10-10` → start_at
    // 2026-10-10T17:00Z (=20:00 местного) / end_at 2026-10-11T16:00Z (=19:00), и `…-2026-10-11`
    // → только 11.10 19:00 (финальный день).
    keep: '8a693a07', archive: '8a7f366d', token: /melancholia/i,
    windowInside: true, venue: 'municipal theatre',
    source: { start_date: '2026-10-10', start_time: '20:00:00', end_date: '2026-10-11' },
    note: 'Amalia Melancholia η Βασίλισσα των Φοινίκων – Διεθνές Φεστιβάλ Λευκωσίας 2026, Никосия, Nicosia Municipal Theatre: оставлена карточка полного интервала 10.10 20:00 → 11.10 19:00 (слаг …-2026-10-10), архив — карточка того же события, датированная финальным днём 11.10 19:00 (слаг …-2026-10-11)',
  },
  {
    // тот же подкласс «финальный день многодневного» (запуск 134), источник — Cyprus Now.
    // Проверено 09.10.2026 через прокси 10809: API `?q=oinofest` отдаёт ДВЕ записи —
    // каноническая `…the-modern-wine-festival-in-omodos-village-2026-10-09` → start_at
    // 2026-10-09T16:00Z (=19:00 местного) / end_at 2026-10-11T20:30Z (=23:30), venue «Omodos Square»;
    // вторая `…2026-10-11` → только 11.10 10:00–23:30 (venue не задан).
    keep: 'd4302240', archive: 'dbb4cbec', token: /oinofest/i,
    windowInside: true, venue: 'omodos',
    source: { start_date: '2026-10-09', start_time: '19:00:00', end_date: '2026-10-11' },
    note: 'OinoFest 2026, Омодос (Omodos), Лимасол: оставлена карточка полного интервала 09.10 19:00 → 11.10 23:30 (адрес «Omodos Square», слаг …village-2026-10-09), архив — карточка того же события, датированная финальным днём 11.10 10:00–23:30 (адрес «Omodos Central Square», слаг …2026-10-11)',
  },
];

const rows = await selectAll(db, 'events', 'id,title,title_ru,start_date,start_time,end_time,end_date,recurrence,city,address,lat,lng,website,status,photos,description,description_en');
const live = rows.filter((r) => r.status === 'active');
const byId = new Map(live.map((r) => [r.id.slice(0, 8), r]));
const near = (a, b, c, d) => Math.abs(Number(a) - b) < 0.0015 && Math.abs(Number(c) - d) < 0.0015;

let applied = 0, skipped = 0;
for (const p of PAIRS) {
  const keep = byId.get(p.keep), kill = byId.get(p.archive);
  if (!keep) { console.log(`ПРОПУСК ${p.keep}: оставляемая карточка не active/нет в базе`); skipped++; continue; }
  if (!kill) { console.log(`ПРОПУСК ${p.archive}: карточка не active/нет в базе`); skipped++; continue; }
  const fail = [];
  if (p.windowInside) {
    // подкласс «одно событие — две страницы источника, архивируемая датирована финальным днём»:
    // арбитр — страница источника (JSON-LD даёт полный интервал события). Интервал архивируемой
    // обязан лежать ВНУТРИ интервала источника (start >= start и end <= end), площадка и город —
    // совпадать; если интервалы равны, пара разбирается вручную.
    const s = p.source || {};
    const kEnd = kill.end_date || kill.start_date;
    if (keep.start_date !== s.start_date || (keep.start_time || '') !== (s.start_time || ''))
      fail.push(`оставляемая не совпадает со стартом источника (${keep.start_date} ${keep.start_time} vs ${s.start_date} ${s.start_time})`);
    if (!s.end_date) fail.push('у источника не задан end_date');
    if (kill.city !== keep.city) fail.push(`города разные (${kill.city} / ${keep.city})`);
    const vRe = new RegExp(p.venue || '', 'i');
    if (!p.venue || !vRe.test(kill.address || '') || !vRe.test(keep.address || ''))
      fail.push(`площадка «${p.venue}» не совпадает у обеих карточек (${keep.address} / ${kill.address})`);
    if (kill.start_date < s.start_date) fail.push(`архивируемая начинается раньше источника (${kill.start_date} < ${s.start_date})`);
    if (kEnd > s.end_date) fail.push(`архивируемая выходит за интервал источника (${kEnd} > ${s.end_date})`);
    if (kill.start_date === s.start_date && kEnd === s.end_date) fail.push('интервалы совпадают — разбирать вручную');
  } else if (p.seriesLastDay) {
    // подкласс «серия с недельным повтором + карточка последнего дня серии»: арбитр — сами карточки.
    // Оставляемая обязана быть серией (recurrence weekly), её конец = дата архивируемой, у обеих
    // одно время начала/окончания, одна площадка в адресе и один пин.
    const rec = keep.recurrence || {};
    const weekly = typeof rec === 'string' ? /weekly/i.test(rec) : rec.freq === 'weekly';
    const vRe2 = new RegExp(p.venue || '', 'i');
    if (!weekly) fail.push('у оставляемой нет недельного повтора — разбирать вручную');
    if (keep.end_date !== kill.start_date) fail.push(`end_date оставляемой (${keep.end_date}) не равен дате архивируемой (${kill.start_date})`);
    if (kill.end_date && kill.end_date !== kill.start_date) fail.push(`архивируемая не однодневная (${kill.start_date}→${kill.end_date})`);
    if ((kill.start_time || '') !== (keep.start_time || '')) fail.push(`время начала разное (${kill.start_time} / ${keep.start_time})`);
    if ((kill.end_time || '') !== (keep.end_time || '')) fail.push(`время окончания разное (${kill.end_time} / ${keep.end_time})`);
    if (kill.city !== keep.city) fail.push(`города разные (${kill.city} / ${keep.city})`);
    if (!p.venue || !vRe2.test(kill.address || '') || !vRe2.test(keep.address || ''))
      fail.push(`площадка «${p.venue}» не совпадает у обеих карточек (${keep.address} / ${kill.address})`);
    if (!near(keep.lat, kill.lat, keep.lng, kill.lng)) fail.push('пины карточек расходятся');
  } else if (p.citySplit) {
    // подкласс «одно событие — два слага источника в РАЗНЫХ городах»: обе страницы дают одну дату и
    // время, поэтому арбитр — не время, а данные карточек: архив обязан стоять на пине, который
    // НЕ является местом события (центровой фолбэк города либо точка, которую источник раздаёт
    // разным адресам), оставляемая — на собственном адресе/площадке.
    const key = (lat, lng) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
    const addrsAtPoint = new Map();
    for (const r of live) {
      const k = key(r.lat, r.lng);
      if (!addrsAtPoint.has(k)) addrsAtPoint.set(k, new Set());
      addrsAtPoint.get(k).add(r.address || '');
    }
    const nearCenter = (lat, lng) =>
      CENTER_FALLBACKS.some(([cLat, cLng]) => Math.abs(Number(lat) - cLat) < 0.0012 && Math.abs(Number(lng) - cLng) < 0.0012);
    const weakPin = (r) => nearCenter(r.lat, r.lng) || (addrsAtPoint.get(key(r.lat, r.lng))?.size || 0) >= 2;
    if (keep.start_date !== p.source.start_date || (keep.start_time || '') !== p.source.start_time)
      fail.push(`оставляемая не совпадает с источником (${keep.start_date} ${keep.start_time})`);
    if (kill.start_date !== p.source.start_date || (kill.start_time || '') !== p.source.start_time)
      fail.push(`архивируемая не совпадает с источником (${kill.start_date} ${kill.start_time})`);
    if (keep.city === kill.city) console.log(`   (инфо: город один и тот же — ${keep.city}; различие только в слаге и пине)`);
    if (weakPin(keep)) fail.push('оставляемая сама стоит на центровом/общем пине — разбирать вручную');
    if (!weakPin(kill)) fail.push('архивируемая НЕ на центровом/общем пине — разбирать вручную');
  } else if (p.cityAddr) {
    // подкласс «одно событие — два слага источника, разные точки»: обе страницы дают одну дату и время,
    // поэтому арбитр — адрес: архивируемая стоит с адресом УРОВНЯ ГОРОДА, оставляемая — с площадкой.
    if (kill.start_date !== keep.start_date) fail.push(`даты разные (${kill.start_date} / ${keep.start_date})`);
    if ((kill.start_time || '') !== (keep.start_time || '')) fail.push(`время разное (${kill.start_time} / ${keep.start_time})`);
    const cityCore = (kill.city || '').split(',')[0].trim().toLowerCase();
    const cityLevel = (r) => {
      const a = (r.address || '').trim().toLowerCase();
      return a === '' || a === (r.city || '').trim().toLowerCase() || a === cityCore;
    };
    if (!cityLevel(kill)) fail.push(`архивируемая с адресом площадки («${kill.address}») — разбирать вручную`);
    if (cityLevel(keep)) fail.push('оставляемая тоже с адресом уровня города — разбирать вручную');
  } else if (p.osmPin) {
    // подкласс «одно событие — два слага источника, у карточек РАЗНЫЕ пины»: третьего источника
    // координат нет, но реальная площадка есть в OSM/Nominatim — оставляем карточку, стоящую на
    // точке площадки, архивируем ту, чей пин от неё далеко (потерянный фолбэк/чужой адрес).
    if (kill.start_date !== keep.start_date) fail.push(`даты разные (${kill.start_date} / ${keep.start_date})`);
    if ((kill.start_time || '') !== (keep.start_time || '')) fail.push(`время разное (${kill.start_time} / ${keep.start_time})`);
    const tol = p.osmPin.tol || 0.002;
    const dist = (r) => Math.hypot(Number(r.lat) - p.osmPin.lat, Number(r.lng) - p.osmPin.lng);
    if (dist(keep) > tol) fail.push(`оставляемая не на площадке из OSM (${dist(keep).toFixed(4)}° > ${tol})`);
    if (dist(kill) <= tol) fail.push('архивируемая тоже на площадке из OSM — разбирать вручную');
  } else if (p.source) {
    // арбитр — страница источника: обе карточки с одного website, а верные дата/время берём из JSON-LD
    if (keep.start_date !== p.source.start_date || (keep.start_time || '') !== p.source.start_time)
      fail.push(`оставляемая не совпадает с источником (${keep.start_date} ${keep.start_time} vs ${p.source.start_date} ${p.source.start_time})`);
    if (kill.start_date === p.source.start_date && (kill.start_time || '') === p.source.start_time)
      fail.push('обе карточки совпадают с источником — разбирать вручную');
  } else {
    if (kill.start_date !== keep.start_date) fail.push(`даты разные (${kill.start_date} / ${keep.start_date})`);
    if ((kill.start_time || '') !== (keep.start_time || '')) fail.push(`время разное (${kill.start_time} / ${keep.start_time})`);
    if (!near(kill.lat, keep.lat, kill.lng, keep.lng)) fail.push(`точки разные (${kill.lat},${kill.lng} / ${keep.lat},${keep.lng})`);
  }
  if (!p.token.test(kill.title) || !p.token.test(keep.title)) fail.push('заголовки не про одно событие');
  if (p.sameSite) {
    if (kill.website !== p.website || keep.website !== p.website) fail.push('website не та страница, что ожидалась');
  } else if (kill.website === keep.website) fail.push('одинаковый website');
  // третьи копии на той же точке/дате
  const same = live.filter((r) => r.id.slice(0, 8) !== p.keep && r.id.slice(0, 8) !== p.archive
    && r.start_date === keep.start_date && near(r.lat, keep.lat, r.lng, keep.lng));
  console.log(`--- ${p.keep} ← оставляю | ${p.archive} ← в архив`);
  console.log(`   ${keep.title} | ${keep.start_date} ${keep.start_time} | ${keep.lat},${keep.lng} | ${keep.address} | фото ${(keep.photos || []).length} | ${keep.website}`);
  console.log(`   ${kill.title} | ${kill.start_date} ${kill.start_time} | ${kill.lat},${kill.lng} | ${kill.address} | фото ${(kill.photos || []).length} | ${kill.website}`);
  if (same.length) console.log(`   ВНИМАНИЕ: на той же точке/дате ещё ${same.length} живых: ${same.map((r) => r.id.slice(0, 8) + ' ' + r.title.slice(0, 40)).join('; ')}`);
  if (fail.length) { console.log(`   -> пропуск: ${fail.join('; ')}`); skipped++; continue; }
  if (!APPLY) { console.log('   DRY: запись не делаю'); continue; }
  const { data, error } = await db.from('events').update({ status: 'archived' }).eq('id', kill.id).select('id,status');
  if (error || !data?.length || data[0].status !== 'archived') { console.log(`   ОШИБКА записи: ${error?.message || JSON.stringify(data)}`); skipped++; continue; }
  applied++;
  console.log('   записано: archived');
  if (p.setEnd) {
    // добивка данных оставляемой карточки из JSON-LD страницы источника (дата окончания события)
    const { data: d2, error: e2 } = await db.from('events').update(p.setEnd).eq('id', keep.id).select('id,status,end_date,end_time');
    if (e2 || !d2?.length) console.log(`   ОШИБКА записи end_date: ${e2?.message || JSON.stringify(d2)}`);
    else console.log(`   записано оставляемой: end_date ${d2[0].end_date} ${d2[0].end_time || ''} (status ${d2[0].status})`);
  }
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
