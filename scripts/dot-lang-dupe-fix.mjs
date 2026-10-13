// Архив близнецов «одно место в двух языках» / один ивент с разных зеркал.
// Правило: у пары одна дата, одно время (после cyHM-ремонта), одно место (адрес RU↔EN),
// но разные источники и у одного из них пин на центровой точке города.
// Оставляем карточку с проверенной площадкой/гео и полем end_date; близнец -> archived.
// DRY по умолчанию, APPLY=1 — применять. Проверка: скрипт перечитывает базу и печатает итог.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// keep -> archive[]  (обоснование в комментарии, проверено по страницам источников)
const PLAN = [
  { keep: '287f1564', drop: ['d6d536c7'],
    why: 'Rantevou Stin Plateia Music Fest 26, 17.10 20:30 Никосия: Шкали/Агланция одна площадка; keep=cyprusnow со скидкой 35.1520356,33.3977267 и end_date, drop=cyprus.bz с пином на центре города' },
  { keep: 'c918d845', drop: ['be61af07'],
    why: 'Roxette Tribute, 17.10 20:00 Лимасол: «Marios Tokas Municipal Garden Theatre» = «Муниципальный садовый театр Мариос Токас»; keep=cyprusnow с гео площадки 34.6837781,33.0550723, drop=cyprus.bz с центровым пином 34.7071,33.0226' },
  { keep: '633a31c7', drop: ['d70a20df'],
    why: 'Murder on the Orient Express 03.10 20:00 Никосия: THOC Theatre (Evis Gabrielides Aud.) = Main Stage; keep=карточка с адресом площадки и прогоном до 27.11, drop=дубль с пином на центре' },
  { keep: 'cd50ee20', drop: ['04f731ea', 'c8db8664'],
    why: 'Race for the Cure Cyprus 01.11 Никосия: с страницы cyprusnow «Sports event at UCY Sports Centre ... at 07:30», расписание 07:30 полумарафон / 08:00 10 км / 09:15 5 км — старт 07:30; у 04f731ea время 09:00 (голова 5-км забега) и пин в центре Никосии (35.1600,33.3771), у c8db8664 пин-заглушка 35.1856,33.3823 и cyprus.bz; keep=cd50ee20 (07:30, UCY Sports Centre, 35.1461934,33.4133854)' },
  { keep: '287f1564', drop: ['36163812'],
    why: 'Rantevou Stin Plateia Music Fest 26, 17.10 20:30 Никосия: третья копия того же cyprus.bz-события (URL /event/33c4/ с другим слагом-переводом); keep=cyprusnow с гео площадки Skali Amphitheatre 35.1520356,33.3977267 и фото, drop=cyprus.bz с пином на центре города 35.1856,33.3823 без фото' },
  { keep: '9fc80d10', drop: ['22baf109'],
    why: 'Sum It Up 2026, 12–13.11 Лимасол, St Raphael Resort: cyprus.bz-зеркало того же события; keep=cyprusnow с гео площадки 34.7131365,33.1674229 и временем 08:30, drop=cyprus.bz с пином на центре Лимасола 34.7071,33.0226 и временем 08:00 (строгий ключ слеп: общих слов названия «sum up 2026» < 3)' },
  { keep: '14f32b9b', drop: ['0734f033'],
    why: 'Psyloween 31.10 20:00–01.11 Ktima Camelot: cyprus.bz-зеркало («Psyloween 2026 (Delight Project x Infinity Crew)»); keep=cyprusnow «Psyloween at Ktima Camelot» с гео площадки 35.0793206,33.193694, drop=cyprus.bz с пином на центре Никосии 35.1856,33.3823; названия дают 1 общее слово — ключ слеп' },
  { keep: 'e2f0b0e2', drop: ['af77fa99'],
    why: 'Anime Sympho-Show by 38 SAMURAI (38 SAMURAI), 22.01.2027 Лимасол: одно событие в двух афишах (cyprusnow vs cyprus.bz), пины в 14.6 км — штатный дедуп слеп; keep=cyprus.bz/event/3139 с площадкой Monte Caputo 34.7183692,33.1879147 и временем 19:30 (подтверждено atriamusic.com, 38samurai.com, limassoltourism.com, cyprus.bz: «Friday, January 22, 2027, 19:30, Limassol, Monte Caputo»), drop=cyprusnow с ВРЕМЕНЕМ 18:30, без площадки в странице (JSON-LD даёт только addressLocality Limassol) и пином 34.6852901,33.0332657' },
  { keep: 'f582be45', drop: ['4ea76971'],
    why: 'Los Vivancos Live, 04–05.11 19:30 Никосия: у обеих карточек ОДИН слаг страницы-источника (…/los-vivancos-live-spanish-dance-music-show-in-cyprus-2026), т.е. одно событие в двух афишах; keep=cyprusnow с пином площадки Strovolos Municipal Theatre 35.1439977,33.343091 и title_en, drop=cyprus.bz с адресом «Pattihio Theatre, Nicosia» и пином на центровом фолбэке Никосии 35.1856,33.3823; штатный дедуп слеп — пины в 5.8 км, samePlace не срабатывает (лид 169)' },
  { keep: '6342cf05', drop: ['d6977caa'],
    why: 'Fyti weaving workshops (Fyti Village Square), 17.10 10:30: у Cyprus Now ДВЕ независимые записи одного и того же занятия — греческая «φυθκιώτικα-υφαντά-2026-10-17» (start_at 07:30Z→10:30Z, т.е. 10:30–13:30 местного, category Culture, image события) и английская «fythkiotika-weaving-with-mrs-eirini-dimitriou-2026-10-17» (start_at 07:30Z, end_at нет); API CN ?q=Fythkiotika и ?q=υφαντ отдают обе записи с ОДНОЙ площадкой Fyti Village Square 34.9287321,32.5437806 и одной датой/временем; keep=греческая карточка (есть время окончания, верный округ Пафос), drop=английская (нет окончания, ложный city «Полис, Кипр»)' },
  { keep: '08fdfad2', drop: ['c575d428'],
    why: 'Mr and Mrs Bubble Show, 14.11 16:00 Никосия (Театр Маскарини): ДВЕ страницы cyprus.bz одного события — EN /event/30b5 и RU /ru/event/35a3, который 301-редиректит на 30b5; страница RU-версии отдаёт JSON-LD location «Театр Маскарини», addressLocality «Никосия», startDate 14.11 14:00Z, а карточка RU была помечена Ларнакой с адресом «Larnaca Municipal Theatre» и пином на центровом фолбэке Ларнаки 34.9182,33.6194; keep=EN-карточка с площадкой и пин OSM «Θέατρο Μασκαρίνι» 35.1188618,33.3780548 (запись ленты CN того же события: Mascarini Theatre, Nicosia, 35.1186931,33.3787897 — расхождение 72 м); штатный дедуп слеп — города разные (Ларнака vs Никосия)' },
  { keep: 'd9c8cac9', drop: ['1c18630f'],
    why: 'Halloween Party в парке Ithaki Amusement Park, 31.10 16:00: одно событие в двух афишах (cyprus.bz и cyprusnow), города разные — штатный дедуп слеп; OSM node 5127723521 «Ithaki Amusement park and MiniGolf», Trikomou, Πέγεια (округ Пафос) = 34.8541124,32.3769874 — это ровно пин карточки cyprus.bz, а JSON-LD её страницы /event/35bd даёт location «Ithaki Amusement park», addressLocality «Paphos»; keep=cyprus.bz с площадкой и пином парка (адрес «Ithaki Amusement park, Paphos»), drop=карточка cyprusnow с ЛОЖНЫМ городом «Никосия, Кипр» и пином на центроиде Никосии 35.18556590,33.38227640 (в округе Никосии парка Ithaki нет — OSM даёт там только улицу в Лимпии)' },
  { keep: '8cf09c7e', drop: ['ed75803c'],
    why: 'The Music of Hans Zimmer (Lords of the Sound), Лимасол 21.01.2027: в ленте Cyprus Now ДВЕ записи одного концерта тура — «the-music-of-hans-zimmer-2027-στη-λεμεσό-2027-01-21» с площадкой Monte Caputo (start_at 17:30Z = 19:30 местного) и «the-music-of-hans-zimmer-by-lords-of-the-sound-2027-01-21» БЕЗ площадки (16:30Z = 18:30); расписание промоутера atriamusic.com даёт в Лимасоле ровно один вечер — 21.01, Monte Caputo, 19:30 (проверено в 200/201), его же держит карточка cyprus.bz /event/35b7 с JSON-LD; keep=карточка bz с площадкой Monte Caputo 34.7183692,33.1879147 и временем 19:30, drop=карточка устаревшей записи ленты (18:30, пин на центрофолбэке Лимасола 34.7071,33.0226, адрес «Лимасол, Кипр») — та же модель, что Shrek Rave/Monfik (две записи CN одного события)' },
  { keep: 'e9dbb4dd', drop: ['110bd468'],
    why: 'Shrek Rave – Halloween Special @ Monfik, 30.10 вечер: у Cyprus Now ДВЕ записи одного события — старая «shrek-rave-halloween-special-monfik-2026-09-30» (start_at 18:00Z, venue у записи НЕТ, в слаге ошибочная дата 30.09) и исправленная «shrek-rave-halloween-special-at-monfik-limassol-2026-10-30» (start_at 19:00Z, venue Monfik 34.6761478,33.0424414); keep=карточка исправленной записи (пин площадки, адрес «Monfik»), drop=карточка старой записи (пин на центровом фолбэке Лимасола 34.7071,33.0226, шаблонный адрес «Axiou, Agia Fylaxis»)' },
  { keep: 'f11532ee', drop: ['aa257c2e', '4325af96'],
    why: 'COMMANDARIA & TRADITION FESTIVAL (2-й Фестиваль гастрономии «Дни Куманадарии и традиций», Кало Хорьо Лимасольское) 17–18.10.2026: ОДИН фестиваль в ТРЁХ афишах. Арбитр — страница Cyprus Tourism (visitcyprus.com/event/days-of-commandaria-delivery-19-20-9-2026/): заголовок «COMMANDARIA & TRADITION FESTIVAL – 17-18.10.2026», календарная запись DTSTART 2026-10-17T14:30:00+03:00 / DTEND 2026-10-18T22:00:00+03:00, место «Commandarias Avenue, Kalo Chorio» — значения карточки visitcyprus 1:1. Лента Cyprus Now держит две записи того же фестиваля с одинаковым интервалом start_at 17.10T11:30Z → end_at 18.10T19:00Z (=14:30→22:00 местного): «commandaria-festival-2026-09-20» (слаг со СТАРОЙ перенесённой датой 20.09) и «commandaria-tradition-festival-17-18-10-2026-2026-10-17»; греческая запись карточки 4325af96 — «2ο Φεστιβάλ Γαστρονομίας «Μέρες Κουμανδαρίας και Παράδοσης» του Καλού Χωριό Λεμεσού» (по описанию фестиваль перенесён с 19–20.09 из-за траура). keep=f11532ee (единственная с верным интервалом 17→18.10 14:30→22:00, адресом «Central Square of the Community, 68 Commandarias Avenue, Kalo Chorio» и пином площадки 34.8495055,33.0238099), drop=aa257c2e (однодневная 18.10 14:30, пин на центровом фолбэке Лимасола 34.7071,33.0226, адрес уровня города «Лимасол, Кипр») и drop=4325af96 (однодневная 18.10 11:00–17:00 — часы не совпадают ни с одним источником, хотя пин площадки верный)' },
  { keep: '96b52dde', drop: ['dca2b8b1'],
    why: 'Limassol Fashion Week 2026: ОДИН фестиваль в двух афишах (cyprusnow и cyprus.bz), штатный дедуп слеп — у карточки bz ЛОЖНЫЙ город. Арбитры: (1) сайт промоутера limassolfashionweek.com — баннер «THE WAREHOUSE / 11-15 NOVEMBER 2026» и страница /venue/ «Located in the heart of Limassol, The Warehouse»; (2) запись ленты Cyprus Now limassol-fashion-week-2026-runway-shows-fashion-events-2026-11-11: start_at 11.11T16:00Z → end_at 20:00Z (=18:00–22:00 местного), venue «The Warehouse by IT», Limassol 34.6628593,33.0261341, ticket_url = сайт промоутера. keep=96b52dde (city «Лимасол, Кипр», расписание приведено по арбитру: 11.11 18:00–22:00, пин The Warehouse), drop=dca2b8b1 (cyprus.bz/event/321d: city «Никосия, Кипр», адрес «Cyprus, Cyprus», пин 35.1293931,33.229783 — ложные метка и точка)' },
  { keep: 'd1fe83d0', drop: ['73772a15'],
    why: 'Двойной музыкальный вечер Международного фестиваля Никосии, 24.10.2026 19:00, Studio Муниципального театра Никосии: ОДНО событие в ДВУХ живых карточках (постоянный зонд dot-cn-live-venue-pairs: одна точка площадки 35.17277,33.3547068, одна дата и время). Арбитр — сама лента Cyprus Now: у ОБЕИХ записей ОДИН И ТОТ ЖЕ текст описания «Σάββατο 24 Οκτωβρίου 2026 | 19:00 & 21:00 Studio Δημοτικού Θεάτρου Λευκωσίας. Δύο σχήματα … συναντιούνται σε μια βραδιά παράδοσης και απροσδόκητων πειραματισμών» (два состава встречаются в ОДИН вечер, два показа 19:00 и 21:00), и есть третья, сводная запись того же вечера «andreas-krambias-quintet-και-ιδαίον-project-σε-μια-διπλή-μουσική-βραδιά-στη-λευκωσία-2026-10-24» (start_at 24.10T16:00Z = 19:00 местного, та же площадка) — т.е. это не два события, а один афишный вечер, разложенный лентой на две записи по составам. keep=d1fe83d0 (первый по биллингу сводной записи состав: Andreas Krambias Quintet, полное описание вечера), drop=73772a15 (запись того же вечера по второму составу Ιδαίον Project); штатный дедуп слеп — названия не дают общих слов («МЕЖДУНАРОДНЫЙ ПРОЕКТ» ↔ «Андреас Крамбьяс – Квинтет»)' },
  { keep: 'e7574ed3', drop: ['b3446de7'],
    why: 'Хэллоуин в Monfik Venue (Лимасол), 31.10.2026 22:00: ОДНА ночь в зале, афишированный ДВУМЯ промоутерами — у ленты Cyprus Now две записи с ОДНОЙ точкой площадки Monfik 34.67614780,33.04244140, одной датой и одним временем (start_at 20:00Z, timezone Кипра 31.10 = UTC+2 → 22:00). Арбитры сходятся по составу: cyprusunderground.com.cy/event/night-of-the-dead — «Night of the Dead — Saturday 31st October 22:00. Electro / IndieDance / Disco / Nu Disco. Manos Scoulos, Lynn Dynasty. Monfik Venue, Limassol»; страница CN /event/noche-de-los-muertos-halloween-party-at-monfik-venue-2026-10-31 — «organized by The House of Apollo … Doors open at 22:00 … Behind the decks, DJ Manos Scoulos … Supreme Host Lynn Dynasty» (те же два диджея, тот же зал, то же время = одна вечеринка в двух афишах). keep=e7574ed3 (запись официальной афиши организатора: полное описание, адрес «Monfik», пин площадки 34.6761478,33.0424414), drop=b3446de7 (клубная сетка cyprusunderground того же вечера; штатный дедуп слеп — названия не дают общих слов «night of the dead» ↔ «noche de los muertos»)' },
];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,start_date,start_time,city,address,lat,lng,website');
let ok = 0, err = 0;
for (const p of PLAN) {
  const keep = rows.find(r => r.id.startsWith(p.keep));
  if (!keep) { console.log(`[SKIP] ${p.keep} не найден`); err++; continue; }
  console.log(`\nKEEP ${keep.id.slice(0, 8)} [${keep.status}] ${keep.start_date} ${keep.start_time} ${keep.city} | ${(keep.title_ru || keep.title).slice(0, 45)}`);
  console.log(`   гео ${keep.lat},${keep.lng} | адрес ${keep.address}`);
  console.log(`   причина: ${p.why}`);
  for (const d of p.drop) {
    const dr = rows.find(r => r.id.startsWith(d));
    if (!dr) { console.log(`   [SKIP] нет ${d}`); continue; }
    console.log(`   DROP ${dr.id.slice(0, 8)} [${dr.status}] гео ${dr.lat},${dr.lng} | ${dr.website}`);
    if (dr.status === 'archived') { console.log('     уже archived'); continue; }
    if (!APPLY) continue;
    const { data, error } = await db.from('events').update({
      status: 'archived',
      auto_review: { at: new Date().toISOString(), flags: ['dupe-lang'], engine: 'dot-lang-dupe-fix', reason: `дубль карточки ${keep.id.slice(0, 8)}: ${p.why}` },
    }).eq('id', dr.id).select('id,status');
    if (error || !data?.length) { console.log('     ОШИБКА', error?.message || 'обновлено 0 строк'); err++; }
    else { console.log(`     archived OK (${data[0].status})`); ok++; }
  }
}
console.log(`\nAPPLY=${APPLY ? 1 : 0} | архивировано ${ok}, ошибок ${err}`);
if (APPLY) {
  const all = await selectAll(db, 'events', 'id,status');
  for (const p of PLAN) {
    const k = all.find(r => r.id.startsWith(p.keep));
    const ds = p.drop.map(d => all.find(r => r.id.startsWith(d))?.status || 'нет').join(', ');
    console.log(`контроль ${p.keep} -> ${k?.status} | ${p.drop.join('/')} -> ${ds}`);
  }
}
