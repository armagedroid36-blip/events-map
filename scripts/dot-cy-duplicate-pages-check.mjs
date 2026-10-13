// Юнит-проверка списка страниц-дублей Cyprus Now (cy-duplicate-pages.mjs).
// Запуск: node scripts/dot-cy-duplicate-pages-check.mjs
import { cnDuplicateOf, CN_DUPLICATE_SLUGS } from './cy-duplicate-pages.mjs';

let ok = 0;
let fail = 0;
const check = (name, got, want) => {
  const pass = got === want;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${pass ? '' : ` (получено ${got}, ожидалось ${want})`}`);
  pass ? ok++ : fail++;
};

const dupSlug = 'official-nicosia-christmas-market-2026-2026-12-19';
const keepSlug = 'limassol-christmas-show-festive-magic-at-st-george-havouzas-2026-12-12';

check('полная ссылка ленты', !!cnDuplicateOf(`https://cyprusnow.app/event/${dupSlug}`), true);
check('голый слаг', !!cnDuplicateOf(dupSlug), true);
check('ссылка с хвостом ?utm', !!cnDuplicateOf(`https://cyprusnow.app/event/${dupSlug}?utm=1`), true);
check('карточка-эталон НЕ дубль', cnDuplicateOf(`https://cyprusnow.app/event/${keepSlug}`), null);
check('чужая страница', cnDuplicateOf('https://cyprusnow.app/event/commandaria-festival-2026-09-20'), null);
check('пусто', cnDuplicateOf(''), null);
check('undefined', cnDuplicateOf(undefined), null);
check('у каждой записи есть keep и why', CN_DUPLICATE_SLUGS.size > 0 &&
  [...CN_DUPLICATE_SLUGS.values()].every((v) => typeof v.keep === 'string' && v.keep.startsWith('https://') && typeof v.why === 'string' && v.why.length > 40), true);

console.log(`\nИтог: ${ok}/${ok + fail} OK`);
process.exit(fail ? 1 : 0);
