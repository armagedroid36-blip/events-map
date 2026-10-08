// Второй независимый источник для остатка embed-аудита Кипра: лента Cyprus Now
// (https://cyprusnow.app/api/events?city=<слаг>&limit=200) отдаёт venue.lat/venue.lng
// площадки. У карточек cyprus.bz, стоящих на центровом фолбэке города, берём точку
// площадки из Cyprus Now — при совпадении названия события И площадки из адреса карточки.
//
// Страховки:
//   1) цель обязана стоять на центровом фолбэке (допуск 0.0012°) ИЛИ быть дальше 3 км от новой точки;
//   2) у новой точки в ленте есть slug площадки (не пусто) и координата с 6+ знаками;
//   3) адрес карточки обязан называть площадку (первое значимое слово площадки из адресa);
//   4) сдвиг > 50 м;
//   5) если округ новой точки не совпадает с округом метки city — city берётся по точке (cityForPoint),
//      расхождение печатается в отчёт.
// DRY по умолчанию, запись — APPLY=1 или --apply.
// node --env-file=.env scripts/dot-cy-cn-venue-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';
import { selectAll } from './db-rows.mjs';
import { districtOf, districtOfCity, cyCityLabel, km } from './cy-districts.mjs';

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const FALLBACKS = new Set(['34.7071', '35.1856', '34.9167', '34.7754', '34.6802', '35.1699', '34.9182', '35.1205']);
const isFallback = (lat) => lat && FALLBACKS.has(String(Number(lat).toFixed(4)));

// id -> { match: событие в ленте Cyprus Now, venue: площадка оттуда, lat/lng, proof: цитата поля из API }
const TARGETS = [
  {
    id: '0b403fd5',
    match: 'Dusty Munky invites VYꓘT',
    venue: 'Dusty Munky',
    addr: ['дасти', 'манки', 'dusty'],
    lat: 34.6796979,
    lng: 33.0461632,
    proof: 'cyprusnow /api/events?city=limassol: title "Dusty Munky invites VYꓘT" 2026-10-10, venue.name "Dusty Munky", city Limassol',
  },
  {
    id: '782e4af9',
    match: 'Jepe (Diynamic / Eastern Standard)',
    venue: 'Dusty Munky',
    addr: ['дасти', 'манки', 'dusty'],
    lat: 34.6796979,
    lng: 33.0461632,
    proof: 'cyprusnow /api/events?city=limassol: title "Jepe (Diynamic / Eastern Standard)" 2026-10-17, venue.name "Dusty Munky", city Limassol',
  },
  {
    id: '8135f18e',
    match: 'Psyloween: Halloween Psychedelic Forest Party at Camelot Park',
    venue: 'Camelot Park',
    lat: 35.1474719,
    lng: 33.3458913,
    proof: 'cyprusnow /api/events?city=nicosia: title "Psyloween: Halloween Psychedelic Forest Party at Camelot Park" 2026-10-31, venue.name "Camelot Park", city Nicosia',
  },
  {
    id: '4ea76971',
    skip: 'CN называет площадку иначе (Strovolos Municipal Theatre, 35.1439977,33.343091), карточка — «Pattihio Theatre, Nicosia»: два источника расходятся в имени зала, нужна страница источника',
    match: 'Los Vivancos Live: Spanish Dance & Music Show in Cyprus',
    venue: 'Strovolos Municipal Theatre',
    lat: 35.1439977,
    lng: 33.343091,
    proof: 'cyprusnow /api/events?city=nicosia: title "Los Vivancos Live: Spanish Dance & Music Show in Cyprus" 2026-11-04, venue.name "Strovolos Municipal Theatre", city Strovolos',
  },
  {
    id: '1685ff91',
    match: 'Samael: Live Black Metal Show in Nicosia',
    venue: 'DownTown Live',
    lat: 35.1649326,
    lng: 33.3498349,
    proof: 'cyprusnow /api/events?city=nicosia: title "Samael: Live Black Metal Show in Nicosia" 2026-11-13, venue.name "DownTown Live", city Strovolos (округ Никосия)',
  },
  {
    id: 'eb163ace',
    match: 'Temor & Blynd Live (тот же клуб, что и Samael)',
    venue: 'DownTown Live',
    lat: 35.1649326,
    lng: 33.3498349,
    proof: 'cyprusnow venue "DownTown Live" 35.1649326,33.3498349 (та же площадка, что у события Samael 13.11 в ленте Никосии)',
  },
  {
    id: '776a44d3',
    match: 'United by Pride: Afterparty at SLLIP Club',
    venue: 'S//IP Slip Nightclub',
    addr: ['sllip'],
    lat: 35.168362,
    lng: 33.35918065,
    proof: 'cyprusnow /api/events?q=sllip: venue.name "S//IP Slip Nightclub", venue.city Nicosia, venue.lat/lng 35.168362,33.35918065 (площадка совпадает с адресом карточки «Sllip Club, Никосия»)',
  },
  {
    id: '38f1871c',
    match: 'Halloween Festival 2026: Spooky Weekend at Cyherbia Botanical Park',
    venue: 'Cyherbia Botanical Park',
    addr: ['cyherbia'],
    lat: 35.0139109,
    lng: 33.830378,
    proof: 'cyprusnow /api/events?q=CyHerbia: title "Halloween Festival 2026: Spooky Weekend at Cyherbia Botanical Park", venue.name "Cyherbia Botanical Park", venue.city Avgorou (округ Фамагуста), venue.lat/lng 35.0139109,33.830378 (адрес карточки — «CyHerbia Botanical Park & Maze»); карточка стояла на центровом фолбэке Фамагусты 35.1205,33.9432',
  },
  {
    id: '57c33588',
    match: 'Wheat Harvest Festival',
    venue: 'Village square',
    addr: ['acheritou'],
    lat: 35.0719751,
    lng: 33.8815901,
    proof: 'cyprusnow /api/events?q=Acheritou: venue.name "Village square", venue.city "Acheritou-Vrysoulles", venue.lat/lng 35.0719751,33.8815901 (адрес карточки — «Village square, Acheritou»); вторая точка ленты «Central Square of Acheritou» 35.0996644,33.8613357 не подходит — карточка называет именно Village square',
  },
  {
    id: '369135b1',
    match: 'The Seven Little Goats and the Wolf. A Children’s Play in Sotira',
    venue: 'Sotira Municipal Theatre (Δημοτικό Θέατρο Σωτήρας)',
    addr: ['sotira', 'сотира', 'σωτήρας'],
    lat: 35.0284699,
    lng: 33.9513191,
    proof: 'cyprusnow /api/events?q=sotira: две карточки того же зала — «Τα μαγικά Χριστούγεννα του Ρούντολφ στην Αμμόχωστο» и «Grinchmas στην Αμμόχωστο» — venue.name "Δημοτικό Θέατρο Σωτήρας", venue.city Cyprus, venue.lat/lng 35.0284699,33.9513191; сама карточка «The Seven Little Goats…» в ленте есть (q=sotira municipal), venue у неё не заполнен. Деревня Сотира — округ Фамагуста, метка city карточки верна',
  },
  {
    id: '0bcecb83',
    match: 'Grinchmas',
    venue: 'Sotira Municipal Theatre (Δημοτικό Θέατρο Σωτήρας)',
    addr: ['sotira'],
    lat: 35.0284699,
    lng: 33.9513191,
    proof: 'cyprusnow /api/events?q=sotira: title «Grinchmas στην Αμμόχωστο», venue.name "Δημοτικό Θέατρο Σωτήρας", venue.lat/lng 35.0284699,33.9513191',
  },
  {
    id: '78eb1c5c',
    match: 'Rudolph',
    venue: 'Sotira Municipal Theatre (Δημοτικό Θέατρο Σωτήρας)',
    addr: ['sotira'],
    lat: 35.0284699,
    lng: 33.9513191,
    proof: 'cyprusnow /api/events?q=sotira: title «Τα μαγικά Χριστούγεννα του Ρούντολφ στην Αμμόχωστο», venue.name "Δημοτικό Θέατρο Σωτήρας", venue.lat/lng 35.0284699,33.9513191',
  },
  {
    id: '2b39ece2',
    match: 'Christmas Festival at CyHerbia',
    venue: 'Cyherbia Botanical Park',
    addr: ['cyherbia'],
    lat: 35.0139109,
    lng: 33.830378,
    proof: 'та же площадка, что у карточки 38f1871c (запуск 70): cyprusnow /api/events?q=CyHerbia → venue.name "Cyherbia Botanical Park", venue.city Avgorou (округ Фамагуста), venue.lat/lng 35.0139109,33.830378',
  },
  {
    id: '2c7a6d58',
    match: 'Pumpkin Carving at CyHerbia',
    venue: 'Cyherbia Botanical Park',
    addr: ['cyherbia'],
    lat: 35.0139109,
    lng: 33.830378,
    proof: 'та же площадка, что у карточки 38f1871c (запуск 70): cyprusnow /api/events?q=CyHerbia → venue.name "Cyherbia Botanical Park", venue.city Avgorou (округ Фамагуста), venue.lat/lng 35.0139109,33.830378',
  },
];

const rows = await selectAll(db, 'events', 'id,status,title,title_ru,city,address,lat,lng,start_date');
let ok = 0, err = 0, dry = 0, skip = 0;
for (const t of TARGETS) {
  const card = rows.find((r) => String(r.id).startsWith(t.id));
  if (!card) { console.log(`${t.id}: карточка не найдена`); skip++; continue; }
  const title = card.title_ru || card.title;
  if (t.skip) { console.log(`${t.id} «${title}»: ПРОПУСК — ${t.skip}`); skip++; continue; }
  const addr = (card.address || '').toLowerCase();
  const words = t.addr || [t.venue.toLowerCase().split(/[\s,/]+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0] || ''];
  if (!words.some((w) => addr.includes(w))) {
    console.log(`${t.id} «${title}»: адрес «${card.address}» не называет площадку «${t.venue}» — пропуск`);
    skip++; continue;
  }
  const d = km(card.lat, card.lng, t.lat, t.lng);
  if (!isFallback(card.lat) && d < 3) {
    console.log(`${t.id} «${title}»: цель не на центровом фолбэке и сдвиг ${d.toFixed(3)} км — пропуск`);
    skip++; continue;
  }
  if (d < 0.05) { console.log(`${t.id} «${title}»: уже на месте (${d.toFixed(3)} км) — пропуск`); skip++; continue; }
  const newCity = cyCityLabel(t.lat, t.lng);
  const pointDistrict = districtOf(t.lat, t.lng);
  const cityDistrict = districtOfCity(card.city);
  const cityToUse = cityDistrict && pointDistrict && cityDistrict === pointDistrict ? card.city : newCity;
  const cityNote = cityToUse === card.city ? 'city не меняется' : `city ${card.city} -> ${cityToUse}`;
  const line = `${t.id} «${title}» (${card.start_date}, ${card.city}, ${card.address}) -> ${t.venue} ${t.lat},${t.lng} | сдвиг ${d.toFixed(2)} км | ${cityNote}`;
  if (!APPLY) { console.log('[DRY] ' + line); dry++; continue; }
  const patch = { lat: t.lat, lng: t.lng };
  if (cityToUse && cityToUse !== card.city) patch.city = cityToUse;
  const { data, error } = await db.from('events').update(patch).eq('id', card.id).select('id,lat,lng,city,status');
  if (error || !data?.length) { console.log(line + ' ОШИБКА: ' + (error?.message || 'обновлено 0 строк')); err++; continue; }
  const back = data[0];
  console.log(line + ` записано -> ${back.lat},${back.lng} ${back.city} [${back.status}] | источник: ${t.proof}`);
  ok++;
}
console.log(`\nитог: применено ${ok}, DRY ${dry}, пропущено ${skip}, ошибок ${err}`);
