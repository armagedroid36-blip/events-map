// Точечный ремонт: интервал гастрольной карточки cyprus.bz заменяется на ДАТУ ПОКАЗА.
// Арбитр — описание записи ленты Cyprus Now (порядок дат по городам) / страница источника.
// Запуск: node --env-file=.env scripts/dot-cy-tour-enddate-fix.mjs [--apply]
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// titleLike | expectCityPrefix | expectStart | expectEnd | newEnd | цитата арбитра
const FIXES = [
  {
    // 13.10.2026: у записи ленты CN end_at = ВТОРОЙ вечер той же серии (два четверга — 8 и 22.10),
    // а не длительность: карточка печаталась «событием на 14 дней» с началом в прошлом.
    titleLike: 'Γώγου',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-08',
    expectEnd: '2026-10-22',
    newEnd: '2026-10-08',
    quote: 'Лента Cyprus Now ?q=mikri (200 через прокси 10809): у серии ДВЕ отдельные записи — κατερίνα-γώγου-με-λένε-οδύσσεια-2026-10-08 (start_at 2026-10-08T18:00Z = 21:00 местного, совпадает с карточкой; end_at 2026-10-22T18:00Z) и …-2026-10-22 (start_at 22.10T18:00Z -> end_at 20:30Z = один вечер), series_count 2, series_first 08.10, series_last 22.10, venue Mikri Arktos 35.1723903,33.3651917 (совпадает с пином карточки); описание записи: «Δύο βραδιές … Την Πέμπτη 8 και 22 Οκτωβρίου» — два вечера, а не 14 дней. Второй вечер уже лежит в базе отдельной карточкой b36cf5b2 (22.10 21:00), её архивировал штатный дедуп как копию интервала — возвращается из архива.',
  },
  {
    // 14.10.2026 (запуск 238): end_at записи = конец ТУРА по городам, а не длительность показа
    // в театре «Анемона»; карточка печаталась «событием 09.10→04.11» с началом в прошлом.
    titleLike: 'Babies Are Brought by the Stork',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-09',
    expectEnd: '2026-11-04',
    newEnd: '2026-10-09',
    quote:
      'Два источника. (1) Описание самой карточки (поле description, источник Cyprus Now): «…ανεβαίνει στη Λευκωσία και σε άλλες πόλεις της Κύπρου, από τον Οκτώβριο έως τον Νοέμβριο 2026» — спектакль идёт в Никосии И ДРУГИХ городах с октября по ноябрь, т.е. 04.11 не относится к никосийскому показу. (2) Лента Cyprus Now (GET /api/events?q=anemona, 200, 2275 байт): запись τα-μωρά-τα-φέρνει-ο-πελαργός-στη-λεμεσό-2026-11-04 — start_at 2026-11-04T18:30Z (=20:30 местного, то же время, что у карточки), end_at 2026-11-04T20:30Z, city Limassol, venue Rialto Theatre 34.679538,33.0458112, series_count 1, series_first = series_last = 04.11 — то есть 04.11 это ЛИМАССОЛЬСКИЙ показ того же тура, отдельная запись. Пин карточки (35.1186557,33.3805564) и адрес «Anemona Theatre» не трогаются.',
  },
  {
    titleLike: 'Luca Minnelli',
    expectCityPrefix: 'Никосия',
    expectStart: '2027-01-10',
    expectEnd: '2027-01-12',
    newEnd: '2027-01-10',
    quote: 'Cyprus Now, описание записи luca-minnelli-…-2027-01-10: «Θα εμφανιστεί στο Δημοτικό Θέατρο Λευκωσίας στις 10 Ιανουαρίου και στο Παττίχειο Θέατρο Λεμεσού στις 12 Ιανουαρίου» — в Никосии концерт 10.01, 12.01 это Лимасол (другой город), поэтому 12.01 не может быть датой окончания никосийской карточки; series_first = series_last = 2027-01-10.',
  },
  {
    titleLike: 'Princess of the Forty Saints',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-11-06',
    expectEnd: '2026-11-15',
    newEnd: '2026-11-07',
    quote: 'Страница промоутера soldoutticketbox.com (event 4418, Erofili Productions), расписание тура по городам: 06/11 Пαρ. 20:00 и 07/11 Σαβ. 20:00 — ΔΗΜΟΤΙΚΟ ΘΕΑΤΡΟ ΛΕΥΚΩΣΙΑΣ (Никосия); 08–10/11 ΛΑΝΙΤΕΙΟ ΘΕΑΤΡΟ ΛΕΜΕΣΟΣ (Лимасол); 11–12/11 ΜΑΡΚΙΔΕΙΟ ΘΕΑΤΡΟ ΠΑΦΟΥ (Пафос); 13–14/11 UCLan Cyprus (Ларнака); 15/11 ΞΕΝΙΟΝ ΠΑΡΑΛΙΜΝΙ (Паралимни). В Никосии показы 06 и 07.11, 15.11 — Паралимни, значит 15.11 не может быть датой окончания никосийской карточки.',
  },
  {
    titleLike: 'Tzak Kai I Fasolia',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-11-14',
    expectEnd: '2027-02-07',
    newEnd: '2026-11-14',
    quote: 'Лента Cyprus Now, запись o-tzak-kai-i-fasolia-2026-2027: start_at 2026-11-14T09:00Z (=11:00 местного, совпадает с карточкой), end_at 2027-02-07T13:00Z, venue Latsia Municipal Theatre 35.1063639,33.3782668, но series_count = 1 и series_first = series_last = 2026-11-14T09:00Z; card_summary: «Η παιδική θεατρική παράσταση … ζωντανεύει επί σκηνής σε όλες τις πόλεις της Κύπρου, από τον Νοέμβριο 2026 έως τον Φεβρουάριο 2027» — end_at это ОКНО ТУРА по городам, а не длительность показа в Латсии.',
  },
  {
    titleLike: 'A Night in Paradise',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-11-27',
    expectEnd: '2027-02-08',
    newEnd: '2026-11-27',
    quote: 'Лента Cyprus Now, запись one-night-in-paradise-greek-comedy-theatre-tour-in-nicosia-2026-11-27: start_at 2026-11-27T18:30Z (=20:30 местного, совпадает с карточкой), end_at 2027-02-08T18:30Z, venue Latsia Municipal Theatre, series_count = 1, series_first = series_last = 2026-11-27T18:30Z; описание записи: «Η θεατρική κωμωδία … περιοδεύει σε όλες τις πόλεις της Κύπρου από τον Νοέμβριο 2026 έως τον Φεβρουάριο 2027 … ξεκινά στις 27 Νοεμβρίου 2026 στο Δημοτικό Θέατρο Λατσιών» — карточка в Латсии открывает тур 27.11, 08.02 это конец тура по острову.',
  },
  {
    // 13.10.2026: тот же класс, что и «Снежная королева» — у англ. записи ленты CN
    // end_at = конец СЕЗОНА постановки, а не её собственный вечер.
    titleLike: 'Orient Express',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-03',
    expectEnd: '2026-11-27',
    newEnd: '2026-10-03',
    quote: 'Лента Cyprus Now ?q=orient express (200 НАПРЯМУЮ с RU-IP), запись murder-on-the-orient-express-agatha-christie-theatre-at-thoc-nicosia-2026-10-03: start_at 2026-10-03T17:00Z (=20:00 местного, совпадает с карточкой), venue THOC Theatre – Evis Gabrielides Auditorium 35.1627039,33.3592448 (совпадает с пином карточки), end_at 2026-11-27T18:30Z, но series_count = 1 и series_first = series_last = 2026-10-03T17:00Z — запись описывает ОДИН вечер, а end_at это окно показов сезона. Вторая запись той же ленты (murder-on-the-orient-express-2026-10-03) держит те же start/end_at начала и series_first = series_last = 03.10.',
  },
  {
    // 13.10.2026: тот же класс — карточка печаталась «событием с 09.10 по 01.11».
    titleLike: 'Bilingual Theatre Production',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-09',
    expectEnd: '2026-11-01',
    newEnd: '2026-10-09',
    quote: 'Лента Cyprus Now ?q=brandy sour (200 НАПРЯМУЮ с RU-IP), запись brandy-sour-bilingual-theatre-production-in-nicosia-2026-10-09: start_at 2026-10-09T18:00Z (=21:00 местного, совпадает с карточкой), venue Goethe-Institut Cyprus 35.1772179,33.35465 (совпадает с пином карточки), end_at 2026-11-01T18:00Z, но series_count = 1 и series_first = series_last = 2026-10-09T18:00Z — 01.11 это последняя дата серии показов по острову (записи Ларнака 13.10, Пафос 14.10, Никосия 16/20/30.10 идут отдельными записями), а не длительность никосийского вечера.',
  },
  {
    // 13.10.2026: живая англ. карточка одной из постановок серии «Снежная королева»
    // (Satiriko Theatre) несла ИНТЕРВАЛ СЕРИИ в end_date: 04.10 -> 20.12, т.е. печаталась
    // «событием на 2.5 месяца» с началом В ПРОШЛОМ (04.10). Источник моделирует эту серию
    // записями ПО ДНЯМ (series_id 01659915, series_count 11, series_first 04.10, series_last 20.12),
    // и у греческой записи-двойника той же страницы (карточка 32f55a5f, архив) end_date = 04.10.
    titleLike: 'Snow Queen',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-04',
    expectEnd: '2026-12-20',
    newEnd: '2026-10-04',
    quote: 'Лента Cyprus Now ?q=satiriko (200 НАПРЯМУЮ с RU-IP): у записей серии «Η Βασίλισσα του Χιονιού» series_id 01659915, series_count 11, series_first 2026-10-04, series_last 2026-12-20, и каждая запись идёт СВОИМ днём (18.10: start_at 08:00Z -> end_at 09:30Z = 11:00-12:30 местного, venue Satiriko Theatre 35.1632112,33.3864655) — 04.10 это одна из 11 постановок, а не интервал. Двойник той же страницы источника (карточка 32f55a5f, status archived, start_date 04.10 08:00) держит однодневную дату 04.10.',
  },
  {
    // 13.10.2026: САТЕЛЛИТЫ той же серии Brandy Sour (Никосия) — у каждой карточки
    // end_date = конец ближайшего двухдневного окна ленты, а не её собственный вечер.
    // Две карточки серии носят ОДНО название, поэтому фильтр по слагу страницы.
    titleLike: 'Brandy Sour στη Λευκωσία',
    websiteLike: 'brandy-sour-στη-λευκωσία-2026-10-16',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-16',
    expectEnd: '2026-10-18',
    newEnd: '2026-10-16',
    quote: 'Лента Cyprus Now ?q=brandy sour (200 через прокси 10809), запись brandy-sour-στη-λευκωσία-2026-10-16: start_at 2026-10-16T18:00Z (=21:00 местного, совпадает с карточкой), venue Goethe-Institut Zypern 35.1729874,33.3760007, end_at 2026-10-18T17:00Z, но series_count = 3 (series_first 16.10, series_last 30.10) — записи серии идут ПО ДНЯМ (20.10, 30.10 — отдельные записи), поэтому 18.10 это окно серии, а не длительность вечера 16.10.',
  },
  {
    titleLike: 'Brandy Sour στη Λευκωσία',
    websiteLike: 'brandy-sour-στη-λευκωσία-2026-10-30',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-30',
    expectEnd: '2026-11-01',
    newEnd: '2026-10-30',
    quote: 'Лента Cyprus Now ?q=brandy sour, запись brandy-sour-στη-λευκωσία-2026-10-30: start_at 2026-10-30T19:00Z (=21:00 местного, совпадает с карточкой), venue Goethe-Institut Zypern 35.1729874,33.3760007, end_at 2026-11-01T18:00Z, series_count = 3, series_first = 2026-10-16, series_last = 2026-10-30 — 30.10 это ПОСЛЕДНИЙ вечер серии, значит 01.11 не может быть датой окончания карточки этого вечера.',
  },
  {
    // 13.10.2026: тот же класс, но у записи ленты CN — ГАСТРОЛЬНЫЙ тур по городам:
    // end_at = конец тура по острову, а карточка печаталась «событием 04.10 -> 18.10».
    // Арбитр — блок «🗓️ Πρόγραμμα» в HTML самой записи CN (пять городов, пять дат).
    titleLike: 'Οικογένεια Κουάξ',
    expectCityPrefix: 'Лимасол',
    expectStart: '2026-10-04',
    expectEnd: '2026-10-18',
    newEnd: '2026-10-04',
    quote: 'Блок «🗓️ Πρόγραμμα» страницы записи Cyprus Now /event/oikogeneia-kouax-children-s-theatre-show-across-cyprus-2026-10-04: «Κυριακή 4 Οκτωβρίου 2026 | 10:30 (Παττίχειο Δημοτικό Θέατρο, Λεμεσός); Σάββατο 10.10 16:00 (Μαρκίδειο, Πάφος); Κυριακή 11.10 10:30 (Σωτήρας, Αμμόχωστος); Σάββατο 17.10 16:00 (Γ. Λυκούργος, Λάρνακα); Κυριακή 18.10 10:30 (Στρόβολος, Λευκωσία)» — лимасольский показ ОДИН: 04.10 10:30 в Паттихо (совпадает с карточкой 1:1), 18.10 это НИКОСИЯ (Стрóволос), т.е. 18.10 не может быть датой окончания лимасольской карточки. У записи series_count = 1, series_first = series_last = 2026-10-04.',
  },
  {
    // 13.10.2026: тот же класс — тур «Across Cyprus», у карточки Никосии интервал тура в end_date.
    // Название карточки содержит кириллическую «о» в латинском слове (Prospathоume) — фильтр по части названия.
    titleLike: 'Contemporary Greek Comedy Across Cyprus',
    expectCityPrefix: 'Никосия',
    expectStart: '2026-10-10',
    expectEnd: '2026-10-18',
    newEnd: '2026-10-10',
    quote: 'Блок «🗓️ Πρόγραμμα» страницы записи Cyprus Now /event/prospathоume-contemporary-greek-comedy-across-cyprus-2026-10-10: «Σάββατο 10.10 20:00 (Θέατρο Μασκαρίνι, Λευκωσία); Κυριακή 11.10 20:00 (Θέατρο Μασκαρίνι, Λευκωσία); Παρασκευή 16.10 20:00 (Αμερικανικό Πανεπιστήμιο Λάρνακα); Κυριακή 18.10 20:00 (Θέατρο Versus, Λεμεσός)» — 18.10 это ЛИМАСОЛ, показы карточки в Никосии 10 и 11.10, значит 18.10 не дата окончания никосийской карточки. У записи series_count = 1, series_first = series_last = 2026-10-09T16:30Z (=19:30 местного, время первой показа).',
  },
];

let applied = 0, skipped = 0, errors = 0;
for (const f of FIXES) {
  let q = db.from('events')
    .select('id,title,city,start_date,start_time,end_date,end_time,status,website')
    .ilike('title', `%${f.titleLike}%`)
    .eq('status', 'active');
  // 13.10.2026: у одной постановки-серии бывает НЕСКОЛЬКО живых карточек с ОДНИМ названием
  // («Brandy Sour στη Λευκωσία» 16/20/30.10) — их различает только слаг страницы источника,
  // без websiteLike ilike даёт 2+ совпадения и карточка молча пропускается.
  if (f.websiteLike) q = q.ilike('website', `%${f.websiteLike}%`);
  const { data, error } = await q;
  if (error) { console.log('ОШИБКА чтения:', f.titleLike, error.message); errors++; continue; }
  const rows = (data || []).filter(r => (r.city || '').startsWith(f.expectCityPrefix));
  if (rows.length !== 1) { console.log('ПРОПУСК (совпадений', rows.length, '):', f.titleLike); skipped++; continue; }
  const r = rows[0];
  if (String(r.start_date) !== f.expectStart || String(r.end_date) !== f.expectEnd) {
    console.log('ПРОПУСК (даты не те:', r.start_date, '->', r.end_date, '):', r.title, r.id);
    skipped++; continue;
  }
  console.log((APPLY ? 'ЗАПИСЬ' : 'ПЛАН'), r.id, '|', r.title, '|', r.start_date, '->', r.end_date, '=>', f.newEnd);
  console.log('   цитата:', f.quote.slice(0, 160) + '…');
  if (!APPLY) continue;
  // интервал свёрнут к одному дню: end_time остался от даты КОНЦА интервала и печатает «конец раньше начала»
  const patch = { end_date: f.newEnd };
  if (f.newEnd === String(r.start_date) && r.end_time && r.start_time && String(r.end_time) < String(r.start_time)) patch.end_time = null;
  const { data: upd, error: e2 } = await db.from('events').update(patch).eq('id', r.id).select('id,start_date,start_time,end_date,end_time,city,title');
  if (e2) { console.log('  ОШИБКА записи:', e2.message); errors++; continue; }
  if (!upd || upd.length !== 1) { console.log('  ОШИБКА: обновлено строк', upd ? upd.length : 0); errors++; continue; }
  console.log('  контроль:', JSON.stringify(upd[0]));
  applied++;
}
console.log(`ИТОГО применено ${applied}, пропущено ${skipped}, ошибок ${errors}`);
