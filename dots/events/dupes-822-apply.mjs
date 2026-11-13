#!/usr/bin/env node
// Запуск 823: снятие подтверждённых дублей-переводов с живой карты.
// Пары взяты из dots/events/leads-dupes-822.json (офлайн-зонд по прод-снапшоту 1307 карточек),
// вердикты вынесены по данным снапшота + арбитру ленты Cyprus Now (23.11.2026).
// Правило: канон остаётся активным, копия уходит в archived с auto_review reject/duplicate.
// Использование:  node --env-file=~/projects/events-map/.env dupes-822-apply.mjs        (dry-run)
//                 APPLY=1 node --env-file=... dupes-822-apply.mjs                       (запись)
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const APPLY = process.env.APPLY === '1';
if (!URL_ || !KEY) { console.error('нет SUPABASE_URL/SUPABASE_SERVICE_ROLE в окружении'); process.exit(2); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// canon — кто остаётся; copy — кого архивируем; why — арбитр вердикта
const PAIRS = [
  { canon: '2395be47-3b5c-4e3d-bb61-5a8be61592b0', copy: 'f3e6dabe-1a9b-4fb1-a8d2-c97f204f1666',
    why: '200 Kithares: EN и GR название, 22.11 20:30 Pattihio, пин и адрес совпадают' },
  { canon: '0ac3c6f0-25a6-4117-9456-4ac042b01037', copy: '844a854f-5441-4e05-ba32-bde3970f0aa2',
    why: 'Камерная музыка 1 / ΜΟΥΣΙΚΗ ΔΩΜΑΤΙΟΥ 1, 25.11 20:00 Markideio, пин совпадает' },
  { canon: '1e3a9b12-8c38-4aca-8a6a-8d35558cb1a6', copy: 'f16fd98a-57ef-4884-97e4-d448c714c6f2',
    why: 'Atrévete в Никосии / in Nicosia, 27.11 21:00 Loft, пин 35.168391,33.317134 у обеих' },
  { canon: '392ba0fd-cc9f-41c7-939a-7d5c869b980d', copy: 'e9f923e5-e2ac-4e75-b339-2961eb873bac',
    why: 'Три кипрские сказки / Μια Κύπρος παραμύθκια, 29.11 11:00 Markideio' },
  { canon: '6d65cafc-6929-4ed5-b45c-b9a3e94074d0', copy: 'd8665ad8-cc7a-4e0e-a306-35ed4bbad678',
    why: 'Christmas Village в Лании / Christmas in Lania, 06.12 10:00 Laneia Village Square' },
  { canon: 'fa04f4e7-7608-47cf-8cd3-3fcd36d82c04', copy: '7f95451c-eca2-4cf9-af7f-8c4df3a5d35d',
    why: 'Larnaca Christmas Market 2026: лента CN даёт окно 11.12 15:00Z → 13.12 18:30Z (=11→13.12), у RU-копии end 21.12 не подтверждён' },
  { canon: 'b1f74f64-5979-4265-98bf-98c299ecd90d', copy: '98f999a5-5846-450c-a26f-8d56df972c28',
    why: 'Μια Νύχτα Αλλιώς στη Λευκωσία = «Другой вечер в Никосии», 18.11 20:30 DownTown Live, пины в 5 м' },
  { canon: '931f78d4-ae80-46f8-8132-dc023773c9e5', copy: '180c5e82-b67d-4267-bb8d-166de4ce9ae2',
    why: 'La Traviata, 09.12 19:30→10.12, Муниципальный театр Никосии, обе карточки — агрегат двух дней' },
  { canon: 'aefc5144-dfed-461b-9dbb-f43008dc8f4d', copy: '38c355ff-9b0d-45b2-b4ad-865d63370a76',
    why: 'лента CN: «Panic Alarm (GR) … support from House of Treason and Onearr», 23.12 20:30 Savino Live ⇒ «Panic Over Cyprus …» — тот же вечер с искажённым именем' },
  // --- запуск 824: офлайн-зонд «одна дата, 300 м – 5 км, 2+ общих слова» по снапшоту 1307 карточек ---
  { canon: '7ebebfb0-ae62-484d-93e8-310efe28a097', copy: '980f0b74-0a97-413c-bb1b-14ef07980129',
    why: 'Christmas Avenue у собора Панагия Пантанассис: одна дата 28→29.12, время 10:00–19:00 совпадает 1:1, RU-карточка стоит на соборе, EN-копия — на известной фолбэк-точке геокодера CN 34.6786322,33.0413055' },
  { canon: 'f2eb1c6c-8d41-478e-ba31-e007412ba646', copy: '31e0df3f-871c-41d1-9c9c-bd0580d7cf55',
    why: 'Statos-Agios Fotios Christmas Village: одна деревня, окно 21.11→06.01 у обеих; у канона адрес называет площадь деревни и пин площадки (34.8908714,32.6100276), у копии адрес-заглушка «Cyprus, Cyprus» и время 10:00 против 11:00' },
  // --- запуск 825: офлайн-зонд «одна дата, >5 км, 3+ общих слова» (туры/гастроли) по снапшоту 1307 карточек ---
  { canon: '5ef76609-7247-48e6-8246-5070f9559530', copy: 'd49ed492-79f6-4cc2-b991-844f20f4fc3b',
    why: 'Island People Excellence Award 2026: EN-карточка и RU-перевод одной конференции, 27→28.11 09:00 у обеих; лента CN ?q=island people даёт ОДНУ запись (24.11, venue null), т.е. второй записи нет — города-заглушки (Никосия / «Cyprus, Cyprus») расходятся потому, что площадку не называет ни один канал' },
  { canon: '2e1b6134-a03d-40ef-b6d6-2556f5004770', copy: '99a661e4-213f-4265-ae55-e128e0641af8',
    why: 'Velvet Void Oblivion Protocol (31.12 21:00, адрес «Ktima Camelot»): канон стоит на реальной площадке Ktima Camelot 35.0793206,33.193694 (Никосия), у копии пин 34.6954473,33.0349311 и city Лимасол при том же имени площадки; лента CN держит на этот вечер ДВЕ записи одного слага (…-2) — у второй venue назван «Ktima Camelot, Limassol», т.е. геокодер агрегатора подставил лимасольскую точку' },
  // --- запуск 828: зонд «один псевдоним названия (title/title_ru/title_en) на одну дату» по снапшоту ---
  { canon: '9971ea6f-12a4-42a4-8865-507cf5e9bcf3', copy: '4ab1761a-f822-448c-9088-085a0cdbb6a9',
    why: 'Christmas 2026: Festive Parade 27.11 18:30: общий псевдоним title_en «christmas 2026 festive parade» и ОДИН адрес «Griva Digeni Avenue and Kennedy Square» у обеих; лента CN ?q=festive parade даёт единственную запись 27.11 16:30Z (=18:30 местного) с venue «Griva Digeni Avenue and Kennedy Square», city Paphos, 34.7751178,32.422197 — ровно пин канона; у копии city Лимасол и пин 34.7071,33.0226 = центровая константа Лимасола (фолбэк), ни площадки, ни координат источника' },
  // --- запуск 830: зонд «одна дата, >5 км, 2 общих слова» (время задано у обеих, разные города) ---
  { canon: '8e902bbf-fb53-4827-b893-beb664791503', copy: '52324694-bee1-4e14-876c-9d0dc5ef7374',
    why: 'Maurice Fulton 28.11 22:30: лента CN ?q=maurice/fulton даёт ОДНУ запись «Picnic +1 w. Maurice Fulton» 20:30Z (=22:30) с venue «ROTOR.SPORTS» = Picnic, Никосия 35.17429646,33.36326357 — это ровно пин канона (35.1746503,33.3638783, 60 м); у копии адрес сам называет «Picnic + 1, Никосия», но city «Лимасол» и пин 34.9371899,32.8859434 (горы Пафоса, 50 км от площадки) — одна и та же вечеринка, копия с битым городом и пином' },
  // --- запуск 831: зонд «одна дата + 2 общих слова В ОДНОМ ГОРОДЕ, пины 1.5–60 км» (копия с битым пином) ---
  { canon: '5878cb55-9181-45e8-b854-9a00c23496d5', copy: '2230eef1-44a6-4ad3-87f1-bdacd2ccd10e',
    why: 'Ririkkos (кукольный спектакль «Ο Ριρίκκος») 06.12 11:00: GR-карточка и EN-карточка одного шоу (общие слова puppet/ririkkos/ририккос); лента CN ?q=ririkkos даёт ЕДИНСТВЕННУЮ запись 06.12 09:00Z (=11:00 местного) с venue «Acropol Cinema» 35.1540457,33.3675104 = ровно пин EN-карточки; у GR-копии пин 35.001861,33.463332 (19 км, поле у Афиену), адрес «Πολυχώρος Κινηματοθέατρο Ακροπόλ» тот же зал' },
  { canon: '0859b54d-e8ef-4d31-8608-f2745c34b89e', copy: '92553489-b7a1-4527-895b-14879c9c4941',
    why: 'Рождественская площадь Айос-Иоаннис-Пицилиас 05.12 18:00: RU- и GR-карточки одного события (общие слова ioannis/pitsilias/square/площадь); лента CN ?q=pitsilia даёт ОДНУ запись 05.12 16:00Z (=18:00 местного) с venue «Πλατεία Αγίου Ιωάννη Πιτσιλιάς» — имя площади совпадает у обеих; у GR-копии пин 34.6743329,33.0205196 (городская точка Лимасола, 25 км от деревни), у RU-канона 34.901104,33.024707 в самой деревне Питсилия' },
  // --- запуск 832: зонд «дубли со СДВИГОМ ДАТЫ на 1 день» (UTC vs локальная дата источника) ---
  { canon: '9bc97e30-ef11-4aca-ab68-8861072f842b', copy: 'c531e4fd-3580-4e8c-88c5-a9ca13469bd5', dateShift: true, canonEnd: '2026-11-29',
    why: 'Broken Statues (Муниципальный театр Ларнаки, 18:30): две карточки-копии одного прогона — 28.11 и 29.11, одинаковые название/время/адрес/пин 34.9160535,33.6263961 (0 м); лента CN ?q=broken statues держит ОДНУ запись «Broken Statues: Dance Show in Larnaca» с интервалом 28.11 16:30Z → 29.11 16:30Z (=18:30 местного оба дня), series_count 1 ⇒ это одно двухдневное событие, а не два показа; канон получает end_date 29.11, карточка-день 29.11 снимается' },
  // --- запуск 833: зонд «одна дата + ОДИН адрес + время ±30 мин» (группировка по адресу, без слов в названии) ---
  { canon: 'e9965b7c-2e41-436b-9d2b-69666b5c2611', copy: '05cb6eb6-fc81-408e-be79-ee9feeb54295',
    why: 'STARLIGHT 2 (Муниципальный театр Строволоса, Никосия) 19.11 20:30: карточка «Diana Tishchenko» и «Starlight 2: концерт музыки Барбера и Чайковского» — один и тот же вечер (Тищенко солистка программы); лента CN ?q=tishchenko отдаёт ТОЛЬКО записи STARLIGHT 2 (19.11 18:30Z Strovolos 35.1439977,33.343091 = ровно пин канона; 20.11 18:30Z Pattihio), series_count 1; у копии пин 35.1421914,33.3405278 (300 м, общая точка театра) и ложный интервал end_date 20.11 — второй город (Пафос/Лимасол 20.11) держит отдельная карточка 856afbf1' },
  // --- запуск 834: зонд «одна дата + один адрес + РАЗНЫЕ времена» (агрегатор поставил время другого канала) ---
  { canon: 'c06571f6-a50f-4d5c-b1ce-f74ecb58753b', copy: '50780939-1725-4e83-b4fd-118a3a0c00e1',
    why: 'Papazó, DownTown Live (Никосия/Strovolos) 18.12: две карточки одного концерта — «Papazó: Χωρίς Φτερά στη Λευκωσία» 22:00 и «Papazó στο DownTown» 21:00, один адрес «DownTown Live» и один пин 35.1649326,33.3498349 (0 м); арбитр — афиша arounder.cy «PAPAZÓ – WITHOUT WINGS | DOWNTOWN LIVE»: Friday, 18 December 2026, Doors Open 9:00 PM, Concert Starts 10:00 PM, DownTown Live, Emmanouil Roidi 2, Strovolos ⇒ 21:00 у копии — время открытия дверей, начало концерта 22:00 у канона; в ленте CN пары нет (?q=papazo отдаёт только «Το Μπαλκόνι του Papazó» 27.11)' },
  // --- запуск 848: зонд «одна точка площадки + тема + ПЕРЕСЕЧЕНИЕ дат» (прошлые зонды требовали одной start_date) ---
  { canon: '12ed4c0d-a7bc-4c04-bac1-a8b117f9025b', copy: '403e243d-7523-4e8b-9d93-acc28927fc05',
    why: 'Tommy Four Seven @S//IP Club (Sllip Club, Никосия): два экземпляра одной ночи — канон 22.11 00:00 без интервала, копия 21.11 22:00 с ложным интервалом до 22.11. Арбитр — лента CN ?q=tommy four seven: ЕДИНСТВЕННАЯ запись slug tommy-four-seven-s-ip-club-2026-11-21, start_at 2026-11-21T22:00:00Z, end_at null, venue S//IP Slip Nightclub ⇒ 22:00Z = 00:00 местного 22.11 (UTC+2), т.е. время копии — UTC-поле, подставленное как локальное; пару title|start_date не видит' },
  // --- запуск 853: зонд «одна точка + одна дата + РОВНО ОДНО общее слово» (прошлые зонды требовали >=2 слов) ---
  { canon: '245d4f84-23c9-4bcd-8af3-9c9a61a25c71', copy: 'c3e18bbb-db12-4324-a773-6db166d208c0',
    why: 'ELEMENT X в NYX Hotel (Лимасол) 15.11: «ELEMENT X × NYX ROOFTOP» 20:00 и «Element X at NYX Hotel: Black & Red Night» 18:00, один адрес и пин 0 м; арбитр — лента CN ?q=element: ОДНА запись ELEMENT X × NYX ROOFTOP, start_at 2026-11-15T18:00:00Z (=20:00 местного), venue NYX Hotel, Limassol; «BLACK & RED NIGHT / DRESS CODE» — подзаголовок той же записи, т.е. у копии UTC-время подставлено как локальное' },
  { canon: 'a5848da3-31b3-4d8c-8428-64657a4677e2', copy: '69ef9b9e-64c4-4a58-8d99-981a842bac14',
    why: '«Ligo Akoma» (A Little More), Маркидеио, Пафос, 15.11 20:00: EN-карточка и RU-перевод «Ещё чуть-чуть (A Little More)» — одно событие, один адрес и пин 0 м; арбитр — лента CN ?q=akoma: ЕДИНСТВЕННАЯ запись slug ligo-akoma-a-little-more-2026-11-15, start_at 2026-11-15T18:00:00Z (=20:00 местного), venue Markideio Municipal Theatre, Paphos' },
  { canon: 'fdcee3e6-91b8-4594-9af4-3c0fe4b9190d', copy: '920ff9b5-017d-41db-b260-ed9737e49ecf',
    why: 'Мастерская «Από το Αρχαίο αντικείμενο στη Σύγχρονη Δημουργία» / «Глина и древняя печь», Bank of Cyprus Cultural Foundation (Никосия) 15.11 11:00, один адрес и пин 0 м; арбитр — лента CN ?q=αρχαίο: ЕДИНСТВЕННАЯ запись 2026-11-15T09:00:00Z (=11:00 местного), venue Bank of Cyprus Cultural Foundation, Nicosia, серия «Moments at The Museum 26» — RU-карточка перевод той же мастерской' },
  { canon: '22da2eeb-5701-47c0-b8e0-0fab9d5faf3f', copy: '413d88a7-10bc-4c7a-8f4a-9b9a005e09d1',
    why: 'Kreator, Monte Caputo (Лимасол) 22.11: «Kreator» 19:00 и «KREATOR with special guests OVERKILL» 18:30, один адрес, пин 101 м; арбитр — лента CN ?q=kreator И ?q=overkill отдают ОДНУ И ТУ ЖЕ запись slug kreator-2026-11-22, start_at 2026-11-22T17:00:00Z (=19:00 местного), venue Monte Caputo ⇒ отдельного концерта Overkill нет, копия со временем дверей' },
  // --- запуск 855: зонд «одна точка + одна дата + НОЛЬ общих слов» (перевод/транслит имени, все прошлые зонды требовали >=1 слова) ---
  { canon: '3d5f0073-4135-4acb-9b5a-f4d60a19a83e', copy: '0a1cabd7-5fc3-47c2-9c0b-3f0e020be6dc',
    why: 'Поход в Махеру, 08.11 09:00: «Пешая прогулка в Махайре» и «Hiking in Machaira» — одно событие (RU и EN название, общих слов нет); адрес у обеих называет ЭКДРОМИКОС ХОРОС КИОНИЯ («Ekdromikos Choros Kionia» / «Εκδρομικός Χώρος Κιόνια»), время 09:00 совпадает, пины в 0.4 м (34.9207463,33.197732 / 34.9204157,33.1976528)' },
  { canon: 'c518a42a-97f9-47c3-99f9-c30fba30da60', copy: 'c0fd295e-71b3-4318-aca6-e57b8ca30bfc',
    why: 'The One MOM Show, Vinylio Wine Etc (Лимасол) 08.11 19:00: «The One MOM Show» и «The One MOM Show in Limassol» — одна карточка с добавкой города в названии; одинаковые адрес, время 19:00 и пин 34.6728745,33.0412447 (0 м)' },
  { canon: '9fcd506d-27ed-4c31-ba0c-ab6eb0d8763d', copy: '5e19f356-800a-410f-a721-8641f77f2ace',
    why: 'Pattihio Municipal Theatre (Лимасол) 09.11 20:00: «The Nonets feat. Eleonora Roussou» и «The Nonnets» — один вечер, во втором названии опечатка (Nonnets); один зал (Pattihio/Patticheion), время 20:00, пины в 10 м' },
  { canon: 'ca7c6d2b-e41f-48db-89c2-eeabe11b3631', copy: '45ecbda2-4dab-4ee9-b8bd-9c776d2b54e3',
    why: 'Dusty Munky (Лимасол) 21.11 20:00: «PHASE909 Ep14 Ft / Tzuvre / KELER / pesha / Spicy Gipsy» и «PHASE9Ø9 Ep14 at Dusty Munky» — одна вечеринка, во втором названии Ø вместо O; один адрес, время 20:00, пин совпадает (0 м)' },
  { canon: 'f43d56ae-0bb7-40ec-b10c-149d6e511f69', copy: 'bf0658a2-7b83-4842-9b12-71bdaa6fdb10',
    why: 'СБПЧ в Лимасоле 21.11 20:00: «Samoye Bolshoye Prostoye Chislo» (ru-название «Самое большое простое число») и «Группа СБПЧ в Лимасоле» — СБПЧ и есть аббревиатура этого названия; время 20:00 и пин 34.6748699,33.0379258 у обеих, у канона адрес площадки Opus Events Venue, у копии адрес-заглушка «Лимасол, Кипр»' },
  { canon: 'd6238af7-9e42-491d-a6a4-5e7423f99c9c', copy: '50ff5339-9d7f-442b-8c6c-a25724b7058f',
    why: 'Кино в Муниципальном театре Ларнаки 23.11 20:00: карточка с безымянным заголовком «Показ фильма» и канон «Movie Mondays: The dinner / La cena»; арбитр — лента CN ?q=movie mondays: на каждый понедельник ОДНА запись (23.11 «The dinner / La cena» 18:00Z = 20:00 местного, venue Δημοτικό Θέατρο Γ. Λυκούργος), т.е. в этот вечер идёт один фильм, а «Показ фильма» — та же карточка из другого канала' },
  { canon: '6247b513-a767-44c5-b28e-8442013c4dd1', copy: 'c5a85ef1-d93b-4a87-8baa-bb3be7faf703',
    why: 'Кино в Муниципальном театре Ларнаки 30.11 20:00: «Показ фильма» и «Movie Mondays: We believe you» — один сеанс; лента CN ?q=movie mondays держит именно «We believe you» 30.11 18:00Z (=20:00) в том же зале, одна запись на понедельник' },
];

const q = (id) => `${URL_}/rest/v1/events?id=eq.${id}&select=id,title,status,start_date,start_time,city,lat,lng,address`;

async function get(id) {
  const r = await fetch(q(id), { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const a = await r.json();
  return a[0] || null;
}

(async () => {
  console.log(`режим: ${APPLY ? 'APPLY (запись)' : 'DRY-RUN'}; пар ${PAIRS.length}`);
  let ok = 0, skipped = 0, failed = 0;
  for (const p of PAIRS) {
    let c, k;
    try { c = await get(p.canon); k = await get(p.copy); }
    catch (e) { console.log(`! ${p.copy.slice(0, 8)} не читается (${e.message}) — стоп`); break; }
    if (!c || !k) { console.log(`- ${p.copy.slice(0, 8)}: карточки нет в базе`); skipped++; continue; }
    if (c.status !== 'active' || k.status !== 'active') { console.log(`- ${k.id.slice(0, 8)} ${k.status}/${c.status} — не active, пропуск`); skipped++; continue; }
    const dayDiff = Math.round((new Date(k.start_date) - new Date(c.start_date)) / 86400000);
    if (c.start_date !== k.start_date && !(p.dateShift && Math.abs(dayDiff) === 1)) { console.log(`- ${k.id.slice(0, 8)}: даты расходятся ${c.start_date} / ${k.start_date} — пропуск`); skipped++; continue; }
    const dMeta = Math.hypot((c.lat - k.lat) * 111320, (c.lng - k.lng) * 111320 * Math.cos(c.lat * Math.PI / 180));
    console.log(`${k.id.slice(0, 8)} «${k.title.slice(0, 45)}» → archived; канон ${c.id.slice(0, 8)} «${c.title.slice(0, 40)}» (${c.start_date} ${c.start_time}, Δ=${dMeta.toFixed(0)} м)`);
    if (!APPLY) { ok++; continue; }
    const body = {
      status: 'archived',
      auto_review: { engine: 'dot-manual', verdict: 'reject', reason: 'duplicate', note: p.why, at: new Date().toISOString() },
    };
    const r = await fetch(`${URL_}/rest/v1/events?id=eq.${k.id}&status=eq.active`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) { console.log(`! PATCH ${r.status}: ${txt.slice(0, 200)}`); failed++; continue; }
    const rows = JSON.parse(txt || '[]');
    if (rows.length !== 1) { console.log(`! PATCH вернул ${rows.length} строк — не 1`); failed++; continue; }
    if (p.canonEnd) {
      const rc = await fetch(`${URL_}/rest/v1/events?id=eq.${c.id}&status=eq.active`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ end_date: p.canonEnd }),
      });
      const tc = await rc.text();
      if (!rc.ok) { console.log(`! PATCH канона ${rc.status}: ${tc.slice(0, 150)}`); failed++; }
      else console.log(`канон ${c.id.slice(0, 8)}: end_date → ${p.canonEnd}`);
    }
    ok++;
  }
  // readback: на дату каждой пары должна остаться одна живая карточка
  if (APPLY) {
    for (const p of PAIRS) {
      try {
        const r = await fetch(`${URL_}/rest/v1/events?select=id,title,status&id=in.(${p.canon},${p.copy})`, { headers: H });
        const rows = await r.json();
        console.log(`readback ${p.copy.slice(0, 8)}: ` + rows.map(x => `${x.id.slice(0, 8)}=${x.status}`).join(' '));
      } catch (e) { console.log(`readback failed ${e.message}`); }
    }
  }
  console.log(`итог: снято ${ok}, пропущено ${skipped}, ошибок ${failed}`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
