// Юнит: extractTitle склеивает перенесённую фразу и не портит нормальные названия.
process.env.COLLECT_TG_NO_RUN = '1';
const { extractTitle } = await import('./collect-tg.mjs');

const cases = [
  ['Открытый урок по\nйоге для начинающих\n23 октября, 10:00', 'Открытый урок по йоге для начинающих'],
  ['Театральное занятие для\nдетей 6-10 лет', 'Театральное занятие для детей 6-10 лет'],
  ['Живот\n23 октября 20:00\nТеатр', '23 октября 20:00'], // известное правило: строки короче 8 символов пропускаются (до этой правки)
  ['Всем привет!\nБАДМИНТОН В НЯЧАНГЕ\nсуббота', 'БАДМИНТОН В НЯЧАНГЕ'], // регистр сохраняется, правится только первая буква
  ['Open class for\nthe beginners', 'Open class for the beginners'],
  ['Смурфики\n31 октября', 'Смурфики'],
  ['Открытый урок по\nДата: 23 октября', 'Открытый урок'],
];
let ok = 0;
for (const [input, want] of cases) {
  const got = extractTitle(input);
  const pass = got === want;
  if (pass) ok++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} | ${JSON.stringify(got)}${pass ? '' : ` ≠ ${JSON.stringify(want)}`}`);
}
console.log(`${ok}/${cases.length} ok`);
