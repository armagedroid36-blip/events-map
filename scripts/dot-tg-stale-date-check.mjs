// Юнит: staleExplicitDate — явная дата поста в прошлом блокирует LLM-фолбэк даты.
process.env.COLLECT_TG_NO_RUN = '1';
const { staleExplicitDate } = await import('./collect-tg.mjs');

const cases = [
  ['В эту субботу снова собираемся на Weekend GameTalk.\n\n#дата: 24.10', true],
  ['Лекция «Иероним Босх»\n\n27 октября, 19.00\n#дата: 27.10.2026', false],
  ['Серия встреч: 05.10, 12.10, 19.10 в 19:00', true],
  ['Серия встреч: 05.10, 12.11 в 19:00', false],
  ['Участие 250k vnd, дорога 5 км, скидка 10%', false],
  ['Старт 20.12 в 10:00', false],
  ['#дата: 25.10 — сегодняшний пост', false],
];

let ok = 0;
for (const [text, want] of cases) {
  const got = staleExplicitDate(text);
  const pass = got === want;
  if (pass) ok++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} stale=${got} want=${want} :: ${text.replace(/\n/g, ' / ').slice(0, 60)}`);
}
console.log(`\n${ok}/${cases.length} ok`);
process.exit(ok === cases.length ? 0 : 1);
