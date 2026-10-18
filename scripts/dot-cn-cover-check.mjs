// Юнит канала «обложка CN по слагу страницы» (scripts/collect-cyprus.mjs).
// Проверяет на живом Storage Cyprus Now:
//   1) слагу с уникальной обложкой -> URL возвращается;
//   2) брендовая обложка Kuns Studio (один файл на разные события) -> null;
//   3) поля ленты приоритетнее канала (local_image_url не перебивается);
//   4) лента молчит и обложки нет -> пустой массив (карточка без фото, не заглушка).
// Запуск: node --env-file=.env scripts/dot-cn-cover-check.mjs
import { cnCoverBySlug, cnPhotosFor } from './collect-cyprus.mjs';

const cases = [];
function caseOk(name, got, expect) {
  const ok = typeof expect === 'function' ? expect(got) : got === expect;
  cases.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}`);
}

// 1. уникальная обложка (карточка 415930fd «Kosta Kritikos at Dusty Munky», поставлена в 321)
const unique = await cnCoverBySlug(
  'https://cyprusnow.app/event/kosta-kritikos-at-dusty-munky-2026-10-30',
);
caseOk('уникальная обложка по слагу', unique, (v) => typeof v === 'string' && v.endsWith('/cover-800.webp'));

// 2. брендовая обложка студии (md5 7272cdc5…, один файл у 4 разных событий) — не фото
const stub = await cnCoverBySlug(
  'https://cyprusnow.app/event/set-of-2-paint-your-wine-glass-one-off-experience-2026-11-19',
);
caseOk('брендовая обложка отклонена', stub, null);

// 3. поля ленты приоритетнее канала
const fromFeed = await cnPhotosFor(
  { local_image_url: 'https://example.supabase.co/storage/v1/object/public/x/cover-800.webp' },
  'https://cyprusnow.app/event/set-of-2-paint-your-wine-glass-one-off-experience-2026-11-19',
);
caseOk('local_image_url из ленты', fromFeed, (v) => Array.isArray(v) && v.length === 1 && v[0].includes('/x/cover-800.webp'));

// 4. лента молчит, обложки по слагу нет (404) -> пусто
const none = await cnCoverBySlug('https://cyprusnow.app/event/no-such-event-0000');
caseOk('нет обложки -> null', none, null);
const nonePhotos = await cnPhotosFor({}, 'https://cyprusnow.app/event/no-such-event-0000');
caseOk('нет обложки -> photos []', nonePhotos, (v) => Array.isArray(v) && v.length === 0);

const ok = cases.filter(Boolean).length;
console.log(`итог: ${ok}/${cases.length} ok`);
process.exit(ok === cases.length ? 0 : 1);
