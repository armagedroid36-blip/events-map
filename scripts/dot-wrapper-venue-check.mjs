// Юнит правила «адрес-обёртка тура»: node scripts/dot-wrapper-venue-check.mjs
process.env.PROBE_NO_RUN = '1';
const { isWrapperVenue } = await import('./dot-wrapper-venue-probe.mjs');

const cases = [
  ['Multiple venues across Cyprus, Фамагуста', true],
  ['Various venues, Лимасол', true],
  ['σε όλη την Κύπρο', true],
  ['По всему Кипру', true],
  ['Pattichio Theatre, Limassol', false],
  ['Markideio Municipal Theatre, Пафос', false],
  ['', false],
  [null, false],
  ['Maze, Лимасол', false],
];
let ok = 0, fail = 0;
for (const [addr, want] of cases) {
  const got = isWrapperVenue(addr);
  if (got === want) { ok++; console.log('ok  ', JSON.stringify(addr), '→', got); }
  else { fail++; console.log('FAIL', JSON.stringify(addr), '→', got, 'ожидалось', want); }
}
console.log(`\n${ok}/${cases.length} ok, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
