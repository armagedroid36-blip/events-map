// Юнит правила «роллинг-серия Megatix» (класс 1001): у страницы, карточка которой протухла,
// дата берётся со страницы заново, а актуальная карточка страницу не читает вовсе.
// Запуск: node scripts/dot-megatix-rollover-check.mjs
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE ||= 'test-key';
process.env.DRY_RUN = '1';

const { siteAction } = await import('./collect-megatix.mjs');

const TODAY = '2026-11-19';
const HORIZON = '2027-02-17';
const T = (name, got, want) => ({ name, got, want, ok: got === want });

const cases = [
  // страницы в базе нет — обычная вставка
  T('новая страница', siteAction({ existing: null, pageDate: '2026-11-26', today: TODAY, horizon: HORIZON }), 'new'),
  // живая карточка актуальна — страницу не читаем (экономия 150 запросов за прогон)
  T('карточка в будущем', siteAction({ existing: { id: 'a', start_date: '2026-11-26' }, pageDate: '2026-11-26', today: TODAY, horizon: HORIZON }), 'skip'),
  T('карточка сегодня, страница уехала', siteAction({ existing: { id: 'a', start_date: TODAY }, pageDate: '2026-11-26', today: TODAY, horizon: HORIZON }), 'update'),
  T('карточка сегодня, дата та же', siteAction({ existing: { id: 'a', start_date: TODAY }, pageDate: TODAY, today: TODAY, horizon: HORIZON }), 'skip'),
  // протухшая карточка + страница уже показывает следующий сеанс — обновляем (13 кейсов 1001)
  T('протухла, страница 26.11', siteAction({ existing: { id: 'a', start_date: '2026-11-19' }, pageDate: '2026-11-26', today: TODAY, horizon: HORIZON }), 'update'),
  T('протухла, страница 03.12', siteAction({ existing: { id: 'a', start_date: '2026-11-12' }, pageDate: '2026-12-03', today: TODAY, horizon: HORIZON }), 'update'),
  T('протухла, страница завтра', siteAction({ existing: { id: 'a', start_date: '2026-11-18' }, pageDate: '2026-11-20', today: TODAY, horizon: HORIZON }), 'update'),
  // серия закончилась — обновлять не на что
  T('обе даты в прошлом', siteAction({ existing: { id: 'a', start_date: '2026-11-10' }, pageDate: '2026-11-12', today: TODAY, horizon: HORIZON }), 'skip'),
  T('страницы даты нет', siteAction({ existing: { id: 'a', start_date: '2026-11-10' }, pageDate: null, today: TODAY, horizon: HORIZON }), 'skip'),
  T('за горизонтом', siteAction({ existing: { id: 'a', start_date: '2026-11-10' }, pageDate: '2027-06-01', today: TODAY, horizon: HORIZON }), 'skip'),
  T('дата не изменилась', siteAction({ existing: { id: 'a', start_date: '2026-11-10' }, pageDate: '2026-11-10', today: TODAY, horizon: HORIZON }), 'skip'),
  T('у карточки нет даты', siteAction({ existing: { id: 'a', start_date: '' }, pageDate: '2026-11-26', today: TODAY, horizon: HORIZON }), 'skip'),
  // контроль «не ослепли»: та же карточка, но страница вернулась в будущее — правило снова 'update'
  T('контроль обратного хода', siteAction({ existing: { id: 'a', start_date: '2026-11-17' }, pageDate: '2026-11-21', today: TODAY, horizon: HORIZON }), 'update'),
];

let fails = 0;
for (const c of cases) {
  if (!c.ok) {
    fails++;
    console.log(`FAIL  ${c.name}: получили ${JSON.stringify(c.got)}, ждали ${JSON.stringify(c.want)}`);
  } else {
    console.log(`ok    ${c.name} → ${c.got}`);
  }
}
console.log(fails === 0 ? `ИТОГ OK ${cases.length}/${cases.length}` : `ИТОГ FAIL ${fails}/${cases.length}`);
process.exit(fails === 0 ? 0 : 1);
