// Точка «События»: живой тест resolveMap() — ссылки постов должны давать координаты.
// Проверяем формы, которые раньше терялись: /maps/search/<lat>,<lng> (редирект maps.app.goo.gl с ?entry=tts).
process.env.COLLECT_TG_NO_RUN = '1';
const { resolveMap } = await import('./collect-tg.mjs');

const CASES = [
  // карточка 8efd7b8e (@nyachang_ru/24292): «Место проведения: На берегу залива» + ссылка
  { url: 'https://maps.app.goo.gl/MzW8adcygDTfTMik6', expect: [12.195690, 109.206839] },
  // карточка 2536fdd3 («Встреча для мам с малышами в Нячанге»): Google отдаёт имя места, координат нет — тоже валидный результат
  { url: 'https://maps.app.goo.gl/mQYVppy9KNFsA6DN8', expect: 'coords-or-address' },
  // некорректная/мёртвая ссылка — не должно быть исключения
  { url: 'https://maps.app.goo.gl/zzzzzzzzzzzz', expect: 'nothing' },
];

let ok = 0;
for (const c of CASES) {
  const r = await resolveMap(c.url);
  const got = r.lat != null ? `${r.lat},${r.lng}` : null;
  let pass;
  if (Array.isArray(c.expect)) pass = r.lat != null && Math.abs(r.lat - c.expect[0]) < 1e-5 && Math.abs(r.lng - c.expect[1]) < 1e-5;
  else if (c.expect === 'coords-or-address') pass = r.lat != null || !!r.address;
  else pass = r.lat == null && !r.address;
  if (pass) ok++;
  console.log(pass ? 'OK  ' : 'FAIL', c.url, '->', got || `адрес: ${(r.address || 'НЕТ').slice(0, 60)}`);
}
console.log(`${ok}/${CASES.length} OK`);
