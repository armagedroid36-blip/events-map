// dot-cy-venue-pin-fix.mjs — кипрские карточки, стоящие на центровой точке города,
// хотя адрес называет конкретную площадку/улицу → пин по проверенной координате.
// Координаты проверены (источник/OSM), city НЕ меняется (проверено вручную).
// DRY по умолчанию; APPLY=1 — запись.
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { cyCityLabel } from './cy-districts.mjs';

const APPLY = process.env.APPLY === '1';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

// id -> { lat, lng, source, why }
const FIXES = {
  // run 104: остаток фолбэка Фамагусты — села/город уровня населённого пункта (Nominatim)
  '0eaa1378': { lat: 35.0421958, lng: 33.9223452, source: 'Nominatim: Φρέναρος (relation 12315121, place=village, район Фамагуста)', why: 'A Poet Is Like a River — адрес «Frenaros Municipal Amphitheater» = село Френарос (уровень села, как Latsia/Лимпья)' },
  '789f8502': { lat: 35.0149462, lng: 34.0531284, source: 'Nominatim: Πρωταράς (node 21422489, place=town, район Фамагуста)', why: 'Protaras SwimRun — адрес «Protaras» = центр городка Протарас (уровень города)' },
  'e2129973': { lat: 35.0719751, lng: 33.8815901, source: 'лента Cyprus Now (Village square, Acheritou-Vrysoulles) — та же точка, что у переставленной run 70 карточки; слитая страница cyprus.bz/event/349f подтверждает локацию «Village Square, Acheritou-Vrysoulles»', why: '4th Cyprus-Wide Cultural Wheat Harvest Festival — площадь села Ахериту' },
  // run 106: фолбэк Ларнаки — адрес карточки называет площадку, точка взята из ленты Cyprus Now (city=larnaca&limit=200)
  '591cba27': { lat: 34.9108675, lng: 33.6329481, source: 'лента Cyprus Now city=larnaca (venue «Larnaka Multi-functional Centre», 7 знаков; та же точка у 7 событий ленты, первое «IDO Couple Dance Championships»)', why: 'IDO World Championship — адрес «Multi-functional Center for Social Activities and Welfare of Larnaka Municipality, 63 Faneromenis Str.»' },
  '72eea8d4': { lat: 34.9140131, lng: 33.6383829, source: 'лента Cyprus Now city=larnaca (venue «Finikoudes Larnaka», 7 знаков; точка у марафона Radisson Blu — то же событие источника)', why: 'Radisson Blu Larnaka International Marathon — адрес «Finikoudes Promenade, Athinon Avenue»' },
  // run 107: фолбэки Никосии/Лимасола — адрес карточки называет площадку, точка из city-срезов Cyprus Now
  '988b4e49': { lat: 35.17277, lng: 33.3547068, source: 'лента Cyprus Now city=nicosia (venue «Nicosia Municipal Theatre», одна и та же точка у 4 событий ленты)', why: 'Симфонический оркестр Кипра — STARLIGHT 1 — адрес «Nicosia Municipal Theatre, Mouseiou 4, Lefkosia»' },
  '72e8b381': { lat: 34.6844593, lng: 33.060337, source: 'лента Cyprus Now city=limassol (venue «Free2dive, AIDA», 7 знаков)', why: 'World Apnea Championships — адрес «Free2dive, AIDA, 28 October Ave, Limassol»' },
  'ea7d0490': { lat: 34.7781598, lng: 32.4232334, source: 'лента Cyprus Now city=paphos: тот же концерт 18.10.2026 в англ. версии «Scheherazade: One Thousand and One Nights» стоит на venue «Markideio Municipal Theatre» (34.7781598,32.4232334, 7 знаков); в базе 31 карточка Markideio с этой же точкой', why: 'Балет Шехеразада в Пафосе — источник дал только адрес уровня города (центровой фолбэк Пафоса)' },
  // run 108б: остаток фолбэка Ларнаки — языковой двойник в ленте CN и село в заголовке (Nominatim)
  '69edaa68': { lat: 34.9001225, lng: 33.6350216, source: 'лента Cyprus Now city=larnaca: англ. версия того же фестиваля «MahallArt Cultural Festival» 08.10.2026 стоит на venue «Ais Yiannis neighbourgood» (34.90012250,33.63502160, 7 знаков)', why: 'Machalárt 26: Neighbourhood Arts Festival — фестиваль района Айс-Яннис в Ларнаке; источник дал адрес уровня города (центровой фолбэк)' },
  '69dc7e07': { lat: 34.8415374, lng: 33.2686045, source: 'Nominatim: Βάβλα / Vavla (node 2827590746, place=hamlet, Δήμος Λεύκαρών, Епархия Ларнаки)', why: 'Hiking at Vavla — поход у села Вавла (село названо в заголовке), пин стоял на центре Ларнаки в 32 км от места' },
  '137c58e9': { lat: 34.6824125, lng: 33.0259269, source: 'cyprusnow.app (geo площадки, run 39)', why: 'ITF MASTERS 400 — Famagusta Tennis Club, 3 Mesaorias Str, Лимасол' },
  '707055aa': { lat: 34.6824125, lng: 33.0259269, source: 'cyprusnow.app (geo площадки, run 39)', why: 'TEU14 — тот же клуб' },
  'e37a0231': { lat: 34.6824125, lng: 33.0259269, source: 'cyprusnow.app (geo площадки, run 39)', why: 'TEU16 — тот же клуб' },
  '38e9fe08': { lat: 34.6914554, lng: 33.0770619, source: 'Nominatim: Promachon Eleftherias, Λεμεσός (34.6914554,33.0770619)', why: 'Regatta of Champions — FAMAGUSTA NAUTICAL CLUB, Promachon Eleftherias 1, Лимасол' },
  'b65ba6ea': { lat: 34.8943595, lng: 33.2958595, source: 'Nominatim/OSM relation 9226119 Lefkara Dam (Pano Lefkara, Ларнака)', why: 'OMNIVA Events: Lefkara Reservoir' },
  'cfd72366': { lat: 34.9978686, lng: 33.4626265, source: 'страница cyprus.bz/ru/event/3647 (площадка «Kinimatotheatro AKROPOL - LYMPIA», метка «Lympia, Никосия», карта-поиск «Lympia, Cyprus») + Nominatim «Λύμπια, Lympia, Δήμος Νότιας Λευκωσίας-Ιδαλίου, Епархия Никосии»', why: 'Скуликула и человеческий голос — точка НАСЕЛЁННОГО ПУНКТА Лимпья (уровень села, как Latsia в run 62)' },
  'a9877216': { lat: 35.1632112, lng: 33.3864655, source: 'embed карты страницы cyprus.bz/event/34c3 (q=35.1632112%2C33.3864655, 7 знаков); Nominatim: Αγλαντζιά, район Никосия', why: 'One Weekend With Teatro Angelico — площадка Old Xydadiko, Никосия (округ точки = округ метки, city не меняется)' },
  'a380fc2c': { lat: 34.9364894, lng: 32.4082095, source: 'embed карты страницы cyprus.bz/event/35fb (q=34.9364894%2C32.4082095, 7 знаков); Nominatim: «Пано Ародес, район Пафос»', why: 'Santa’s Embassy in Pano-Arodes — село Пано Ародес (в самом заголовке события); метка Лимасола была ложной меткой источника', cityFromPoint: true },
  '8db46e84': { lat: 34.7087687, lng: 32.5749517, source: 'JSON-LD страницы cyprus.bz/ru/event/3303: location.name «Площадь», addressLocality «Куклия» (в тексте страницы — Пафос, Лимасол не упомянут); Nominatim: «Куклия, район Пафос»', why: 'Культурная децентрализация — площадь села Куклия (округ Пафос); метка Лимасола была ложной меткой источника', cityFromPoint: true },
  // run 192: фолбэк Фамагусты — «Ammochostos Cultural Center» физически в Деринее (район Фамагуста)
  '02fdf8a3': { lat: 35.0694388, lng: 33.958601, source: 'embed-карта самой страницы источника (cyprus.bz/event/3728/…: iframe «maps/embed/v1/place?q=35.0694388%2C33.958601», 7 знаков) + независимое подтверждение OSM node 1683723649 «Famagusta Cultural Centre», Ευαγόρα, Деринея, 5380, район Фамагуста (35.0694419,33.9585535 — расхождение 5 м); муниципалитет Аммохостоса сам указывает «Πολιτιστικό Κέντρο Αμμοχώστου στη Δερύνεια» (famagusta.org.cy)', why: 'Artificial Intelligence: Opportunities, Prospects, and Risks — адрес карточки «Ammochostos Cultural Center, Famagusta», пин стоял ровно на центровой константе города (35.1205,33.9432 = collect-cyprus.mjs:88) в 5.8 км от площадки; округ точки — Фамагуста, city не меняется' },
  // run 152: фолбэк Никосии — событие в лесу Махера, а не в городе (источник дал только точку города)
  'd59a9331': { lat: 34.9347492, lng: 33.2034303, source: 'Nominatim: «Εθνικό Δασικό Πάρκο Μαχαιράς / Machairas National Forest Park», leisure=nature_reserve, Επαρχία Λευκωσίας (34.9347492,33.2034303); страница события cyprusnow.app даёт только центр Никосии (35.1855659,33.3822764) при адресе «Machairas Forest»', why: 'Поход с собакой «Hike, Paws & Brunch» — адрес карточки это лес Махера в ~30 км от Никосии; округ точки = округ метки (Левкосия), city не меняется' },
  // run 169: свежая карточка прогона 04:40Z — фолбэк Лимасола, адрес называет Паттихо (7 живых карточек той же площадки на 34.6812148,33.0437204)
  'a0c61d03': { lat: 34.6812148, lng: 33.0437204, source: 'та же площадка в базе: 7 живых карточек «Pattichio Theatre / Театр Паттихо» стоят на 34.6812148,33.0437204 (точка подтверждена embed-картой страниц cyprus.bz и лентой Cyprus Now, запуски 52/53/56)', why: 'Концерт Maxim Galkin — адрес «Театр Паттихо, Лимассол», пин стоял на центре Лимасола (34.7071,33.0226) в 3.4 км от зала' },
  // run 194: фолбэк Никосии — адрес карточки называет NiMAC (независимый арбитр OSM/Nominatim)
  // run 196: фолбэк Пафоса — площадку называет страница промоутера (ссылка в записи источника)
  'd2f536bc': { lat: 34.7781598, lng: 32.4232334, source: 'страница промоутера afishamira.com/event/spektakl-kontsert-piaf-the-show-v-pafose (ссылка из записи Cyprus Now, 200 через прокси): «Пафос, Кипр — Markideio Theatre, Andrea Geroudi, Paphos, Cyprus», 29.01.2027 20:00 (совпадает с карточкой); независимое подтверждение OSM/Nominatim «Markideion Theater, Andrea Geroudi» way 824979277 = 34.7781667,32.4231959; точка площадки уже стоит в базе у 31 карточки Markideio (34.7781598,32.4232334)', why: 'PIAF! THE SHOW в Пафосе — адрес карточки «Пафос, Кипр», пин стоял ровно на центровой константе Пафоса (34.7754,32.4245 = collect-cyprus.mjs:88); округ точки — Пафос, city не меняется' },
  '6e360245': { lat: 35.1739404, lng: 33.3664280, source: 'Nominatim/OSM: «NiMAC, Nicosia Municipal Arts Centre (Exhibitions)», 19 Παλιάς Ηλεκτρικής, Ομεριέ, Λευκωσία (arts_centre, 35.1739404,33.3664280); соседний OSM-объект «Δημοτικό Κέντρο Τεχνών Λευκωσίας» (museum) 35.1739465,33.3667239 — расхождение 34 м', why: 'Honorary Event for Mr. Demetris Z. Pierides — адрес карточки «NiMAC», пин стоял на центровой константе Никосии (35.1856,33.3823) в ~1.9 км от площадки; округ точки — Никосия, city не меняется' },
  // run 203: свежая карточка прогона 38282590591 — фолбэк Фамагусты, площадку называют ДВА независимых арбитра одной точкой
  '2d8c10b6': { lat: 35.0703412, lng: 33.9607167, source: 'два независимых арбитра, одна точка с точностью до знака: (1) embed-карта самой страницы источника cyprus.bz/event/3724/projectfilms101-halloween-cinema-vol2-2026 (iframe «maps/embed/v1/place?q=35.0703412%2C33.9607167», 7 знаков; addressLocality «Famagusta»); (2) лента Cyprus Now ?q=projectfilms — запись «Halloween Cinema Night Vol.2 … Famagusta» с venue_name «Famagusta Avenue Garage Deryneia», venue_lat 35.07034120, venue_lng 33.96071670, venue_slug famagusta-avenue-garage-deryneia-cyprus', why: 'ProjectFilms101 Halloween Cinema Vol.2 — адрес карточки «Famagusta Avenue Garage, Famagusta», пин стоял ровно на центровой константе Фамагусты (35.1205,33.9432 = collect-cyprus.mjs:88) в ~5.7 км от площадки в Деринее; округ точки — Фамагуста, city не меняется' },
  // run 213: свежая карточка прогона 38347579195 — фолбэк Никосии, площадку называют два независимых арбитра одной точкой (±30 м)
  '5db32b6e': { lat: 35.1730032, lng: 33.3574477, source: 'два независимых арбитра: (1) лента Cyprus Now ?q=pallas — записи «Louis Patsalidis: 20 Years of Stand-Up Comedy — Live in Cyprus» (23.10.2026) и «Prize Winners Gala Concert Nicosia … Pallas Theater» (10.11.2026) с venue_name «PALLAS THEATRE NICOSIA» 35.17300320,33.35744770 (7 знаков) и «Κινηματοθέατρο Παλλάς» 35.17322950,33.35734610; (2) Nominatim/OSM «Κινηματοθέατρο Παλλάς, 24, Ριγένης, Άγιοι Ομολογητές, Λευκωσία» = 35.1731528,33.3576336 (theatre, округ Никосия) — расхождение ~30 м', why: 'Мюзикл, посвящённый Эдит Пиаф — адрес карточки «Театр Паллас в Никосии», пин стоял ровно на центровой константе Никосии (35.1856,33.3823) в ~2.9 км от зала; округ точки — Никосия, city не меняется' },
  // run 212: фолбэк Лимасола — площадку фестиваля называет и лента источника, и сайт промоутера
  '96b52dde': { lat: 34.6628593, lng: 33.0261341, source: 'лента Cyprus Now (запись limassol-fashion-week-2026-runway-shows-fashion-events-2026-11-11): venue_name «The Warehouse by IT», venue_city Limassol, venue_lat 34.6628593, venue_lng 33.0261341 (7 знаков), ticket_url = https://limassolfashionweek.com; независимое подтверждение — сайт промоутера: страница /venue/ «Located in the heart of Limassol, The Warehouse» и баннер «THE WAREHOUSE / 11-15 NOVEMBER 2026»', why: 'Limassol Fashion Week 2026 — адрес карточки «Лимасол, Кипр» (уровень города), пин стоял ровно на центровой константе Лимасола (34.7071,33.0226 = collect-cyprus.mjs:88) в ~5 км от The Warehouse; округ точки — Лимасол, city не меняется' },
};

const rows = await selectAll(db, 'events', 'id,title,city,address,lat,lng,status');
const byId = new Map(rows.map((r) => [r.id.slice(0, 8), r]));
const near = (a, b) => a != null && Math.abs(a - b) < 0.002;
const CENTERS = [[34.7071, 33.0226], [34.9182, 33.6194], [35.1856, 33.3823], [34.7754, 32.4245], [35.1205, 33.9432]];

let applied = 0, skipped = 0;
for (const [prefix, fix] of Object.entries(FIXES)) {
  const r = byId.get(prefix);
  if (!r) { console.log(`ПРОПУСК ${prefix}: карточки нет в базе`); skipped++; continue; }
  const onCenter = CENTERS.some(([la, ln]) => near(r.lat, la) && near(r.lng, ln));
  const shiftKm = Math.hypot((fix.lat - (r.lat ?? 0)) * 111, (fix.lng - (r.lng ?? 0)) * 91);
  console.log(`${prefix} | ${r.status} | ${r.city} | ${r.lat},${r.lng} -> ${fix.lat},${fix.lng} | сдвиг ${shiftKm.toFixed(2)} км | на центровой: ${onCenter ? 'да' : 'НЕТ'}`);
  console.log(`   ${String(r.title).slice(0, 60)}`);
  console.log(`   ${fix.why} | источник: ${fix.source}`);
  if (!onCenter) { console.log('   -> пропуск: карточка уже не на центровой точке'); skipped++; continue; }
  const payload = { lat: fix.lat, lng: fix.lng };
  if (fix.cityFromPoint) payload.city = cyCityLabel(fix.lat, fix.lng);
  console.log(`   city: ${r.city}${payload.city ? ` -> ${payload.city}` : ' (не меняется)'}`);
  if (!APPLY) continue;
  const { data, error } = await db.from('events').update(payload).eq('id', r.id).select('id,lat,lng,city');
  if (error || !data?.length) { console.log(`   ОШИБКА записи: ${error?.message || '0 строк'}`); skipped++; continue; }
  applied++;
  console.log(`   записано: ${data[0].lat},${data[0].lng}`);
}
console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: применено ${applied}, пропущено ${skipped}`);
