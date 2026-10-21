// Юнит правила «двойник записи ленты Бали» (slug / slug-N) из scripts/collect-bali.mjs.
// Проверяет, что двойник одного события НЕ вставляется второй карточкой, а разные вечера серии — вставляются.
const normSite = (u) => String(u || '').replace(/-\d+$/, '');
const D = (s) => new Date(s);
const isTwin = (site, startDate, liveWebsites) =>
  liveWebsites.some(
    (w) =>
      (w.website === site ||
        (normSite(w.website) === normSite(site) && Math.abs((D(startDate) - D(w.start_date)) / 86400000) <= 1)) &&
      Math.abs((D(startDate) - D(w.start_date)) / 86400000) <= 60,
  );

const B = 'https://baliforum.ru/events/';
const cases = [
  ['кейс 380: yogi / yogi-1, даты 20.10 и 21.10 → двойник, НЕ вставлять', B + 'kurs-podgotovki-prepodavateley-yogi-1', '2026-10-21',
    [{ website: B + 'kurs-podgotovki-prepodavateley-yogi', start_date: '2026-10-20' }], true],
  ['тот же слаг, дата сдвинулась на 1 день → не вставлять', B + 'x-yogi', '2026-10-22',
    [{ website: B + 'x-yogi', start_date: '2026-10-21' }], true],
  ['серия Savaya: -11 и -12 идут по неделям → вставлять', B + 'last-light-v-savaya-bali-12', '2026-11-07',
    [{ website: B + 'last-light-v-savaya-bali-11', start_date: '2026-10-31' }], false],
  ['разные события → вставлять', B + 'a', '2026-10-21', [{ website: B + 'b', start_date: '2026-10-21' }], false],
  ['двойник, но дата далеко (>60 дн) → вставлять (новый сезон)', B + 'x-yogi-1', '2027-03-01',
    [{ website: B + 'x-yogi', start_date: '2026-10-21' }], false],
];
let ok = 0;
for (const [name, site, sd, live, exp] of cases) {
  const got = isTwin(site, sd, live);
  console.log(`${got === exp ? 'ok' : 'FAIL'} — ${name}`);
  if (got === exp) ok++;
}
console.log(`\n${ok}/${cases.length} ok`);
process.exit(ok === cases.length ? 0 : 1);
