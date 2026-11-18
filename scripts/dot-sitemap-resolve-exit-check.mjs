/**
 * Юнит гейта «sitemap резолвится SPA» (`scripts/lib/gate-exit.mjs`).
 *
 * Приёмка правки 18.11.2026: разовый `statement timeout` у list_past_events
 * валил шаг 21 пересборки, хотя мягких 404 было 0 и все страницы живы. Теперь
 * отказ вспомогательного RPC — предупреждение (код 0), а дефект данных —
 * по-прежнему красный прогон (код 1).
 *
 * Запуск: node scripts/dot-sitemap-resolve-exit-check.mjs
 */
import { finalCode } from './lib/gate-exit.mjs';

const cases = [
  // [описание, вход, ожидаемый код]
  ['чисто', { unresolvedCount: 0, badStatusCount: 0, netErrorsCount: 0, legacyProd: true }, 0],
  // кейс 18.11: архивный RPC упал, но поштучная проверка дала 0 кандидатов
  ['отказ архива при 0 кандидатов — не красный', { unresolvedCount: 0, badStatusCount: 0, netErrorsCount: 0, legacyProd: true }, 0],
  ['есть нерезолвящийся URL — красный', { unresolvedCount: 3, badStatusCount: 0, netErrorsCount: 0, legacyProd: true }, 1],
  ['снимок отдаёт не 200 — красный', { unresolvedCount: 0, badStatusCount: 2, netErrorsCount: 0, legacyProd: true }, 1],
  ['мягкий 404 важнее сетевого шума', { unresolvedCount: 1, badStatusCount: 0, netErrorsCount: 5, legacyProd: true }, 1],
  ['сетевые сбои поштучной проверки — неполно', { unresolvedCount: 0, badStatusCount: 0, netErrorsCount: 4, legacyProd: true }, 2],
  ['нет опубликованного снимка удалённых — неполно', { unresolvedCount: 0, badStatusCount: 0, netErrorsCount: 0, legacyProd: false }, 2],
  ['пустой вход — чисто', {}, 0],
];

let ok = 0;
const fails = [];
for (const [name, input, want] of cases) {
  const got = finalCode(input);
  if (got === want) {
    ok += 1;
    console.log(`  ok   ${name} → ${got}`);
  } else {
    fails.push(`${name}: получили ${got}, ждали ${want}`);
    console.log(`  FAIL ${name} → ${got} (ждали ${want})`);
  }
}

console.log(`ИТОГ ${fails.length ? 'FAIL' : 'OK'} ${ok}/${cases.length}`);
if (fails.length) {
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
