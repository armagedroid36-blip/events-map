// dot-centers-coverage-check.mjs — юнит-страховка от повтора корня run 295:
// скрипты ремонта проверяют «карточка стоит на центровой константе города» по списку
// const CENTERS. Когда список был рукописным, в нём не оказалось Ая-Напы — верные цели
// молча получали «на центровой: НЕТ» и пропускались.
// Проверка: каждая центровая константа сборщика (collect-cyprus.mjs -> CY_CITIES)
// присутствует в едином списке cy-districts.mjs -> CY_CITY_CENTERS.
// Запуск: node scripts/dot-centers-coverage-check.mjs  (exit 1 при расхождении)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CY_CITY_CENTERS } from './cy-districts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'collect-cyprus.mjs'), 'utf8');

// вырезаем блок CY_CITIES = { ... };
const block = src.match(/const CY_CITIES = \{([\s\S]*?)\n\};/);
if (!block) {
  console.error('НЕ НАЙДЕН блок CY_CITIES в collect-cyprus.mjs — проверка недействительна');
  process.exit(1);
}
const cities = [];
for (const m of block[1].matchAll(/['"]?([\wА-Яа-яЁё-]+)['"]?\s*:\s*\{\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)\s*\}/g)) {
  cities.push([m[1], Number(m[2]), Number(m[3])]);
}
if (!cities.length) {
  console.error('CY_CITIES распознан пустым — правило парсинга сломалось, проверка недействительна');
  process.exit(1);
}

const eq = (a, b) => Math.abs(a - b) < 1e-6;
let ok = 0, bad = 0;
for (const [name, lat, lng] of cities) {
  const hit = CY_CITY_CENTERS.find(([n, la, ln]) => n === name && eq(la, lat) && eq(ln, lng));
  if (hit) { ok++; console.log(`ok   ${name} ${lat},${lng}`); }
  else {
    const same = CY_CITY_CENTERS.find(([n]) => n === name);
    bad++;
    console.log(`FAIL ${name} ${lat},${lng} — в CY_CITY_CENTERS ${same ? `другие координаты ${same[1]},${same[2]}` : 'города НЕТ'}`);
  }
}
// обратная проверка: в списке нет городов, которых сборщик не знает (опечатки в именах)
const names = new Set(cities.map(([n]) => n));
let extra = 0;
for (const [n] of CY_CITY_CENTERS) {
  if (!names.has(n)) { extra++; console.log(`WARN ${n} есть в CY_CITY_CENTERS, но нет в CY_CITIES сборщика`); }
}
console.log(`\nИтог: сборщик ${cities.length} городов, ok ${ok}, FAIL ${bad}, лишних ${extra}`);
process.exit(bad ? 1 : 0);
