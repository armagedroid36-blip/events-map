// Юнит-проверка извлечения фото со страницы источника (parseImg из dot-photos-fill.mjs).
// Случаи построены на реальных страницах cyprusnow.app, сохранённых в $LOCALAPPDATA/Temp:
//   kaz.html  — у страницы ЕСТЬ своя обложка (cover-1600.webp), og:image = OG-генератор;
//   dd59.html — своей обложки НЕТ, на странице лежат только обложки «похожих событий»
//               (чужие слаги 2026-10-30-jkrhv7 и 30-2026-10-19-15d8gta).
// Сам dot-photos-fill.mjs — скрипт с top-level await (сразу читает базу), поэтому здесь
// функция вынимается из исходника и компилируется отдельно.
// Запуск: node scripts/dot-photos-pageimg-check.mjs
import fs from 'node:fs';

const src = fs.readFileSync('./scripts/dot-photos-fill.mjs', 'utf8');
const start = src.indexOf('function parseImg(');
if (start < 0) {
  console.log('parseImg в dot-photos-fill.mjs не найдена');
  process.exit(2);
}
let depth = 0;
let end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
const fnText = src.slice(start, end);
const parseImg = new Function(`return (${fnText})`)();

const T = process.env.LOCALAPPDATA + '/Temp';
let ok = 0;
let bad = 0;
const check = (name, got, want) => {
  const pass = want instanceof RegExp ? want.test(String(got)) : got === want;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name} -> ${got === null ? 'null' : String(got).slice(0, 90)}`);
  if (pass) ok++;
  else bad++;
};

const kazUrl = 'https://cyprusnow.app/event/grape-harvest-festival-2026-08-16';
if (fs.existsSync(`${T}/kaz.html`)) {
  const h = fs.readFileSync(`${T}/kaz.html`, 'utf8');
  check('своя обложка cyprusnow берётся, самый крупный вариант', parseImg(h, kazUrl), /cover-1600\.webp$/);
} else console.log('SKIP kaz.html нет в Temp');

const ddUrl =
  'https://cyprusnow.app/event/the-grand-antiques-vintage-market-10-10-26-10-00-17-00-προαύλιο-δημαρχείου-στροβόλου-2026-10-10';
if (fs.existsSync(`${T}/dd59.html`)) {
  const h = fs.readFileSync(`${T}/dd59.html`, 'utf8');
  check('своей обложки нет -> null (обложки похожих событий не берём)', parseImg(h, ddUrl), null);
} else console.log('SKIP dd59.html нет в Temp');

check('пустая страница -> null', parseImg('<html></html>', ''), null);
check(
  'обычный og:image не ломается, чужой слаг с той же страницы не подменяет',
  parseImg(
    '<meta property="og:image" content="https://site.tld/pic.jpg"><img src="https://x.supabase.co/storage/v1/object/public/forecast-events/events/other-slug/cover-1600.webp">',
    'https://site.tld/event/my-slug',
  ),
  'https://site.tld/pic.jpg',
);
check(
  'og:image-заглушка (opengraph-image) отклоняется и не подменяется чужим слагом',
  parseImg(
    '<meta property="og:image" content="https://cyprusnow.app/event/my-slug/opengraph-image"><img src="https://x.supabase.co/storage/v1/object/public/forecast-events/events/other-slug/cover-1600.webp">',
    'https://cyprusnow.app/event/my-slug',
  ),
  null,
);

// Страница-подборка danang365 (дайджест «10 шоу Дананга»): og:image — общая картинка статьи,
// у каждого шоу в разделе своё фото (файл назван по шоу). Проверяем на реальной странице.
const dnUrl = 'https://danang365.com/vi/du-lich-da-nang-show-dien-2/';
if (fs.existsSync(`${T}/dn365.html`)) {
  const h = fs.readFileSync(`${T}/dn365.html`, 'utf8');
  check('подборка: фото СВОЕГО раздела (Hồn Việt Show)', parseImg(h, dnUrl, 'Hồn Việt Show'), /Hon-Viet-Show-\d\.(webp|jpg)$/);
  check('подборка: соседнее шоу получает своё фото, а не первое', parseImg(h, dnUrl, 'Tiên Sa Show'), /Tien-Sa-Show-\d\.(webp|jpg)$/);
  check(
    'подборка: события нет среди разделов -> null (общий баннер статьи не пишем)',
    parseImg(h, dnUrl, 'Sun World Ba Na Hills Show'),
    null,
  );
} else console.log('SKIP dn365.html нет в Temp');
console.log(`\nитог: OK ${ok}, FAIL ${bad}`);
process.exit(bad ? 1 : 0);
