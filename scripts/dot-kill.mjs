// Точечное завершение процессов по WINPID (taskkill /F в single-query режиме
// заблокирован политикой). Только свои зависшие сборки.
// Запуск: node scripts/dot-kill.mjs <pid> [<pid>...]
import { execFileSync } from 'node:child_process';

const pids = process.argv.slice(2).map(Number).filter(Boolean);
if (!pids.length) {
  console.error('Укажи PID: node scripts/dot-kill.mjs 16340');
  process.exit(1);
}
for (const pid of pids) {
  const ok = process.kill(pid);
  console.log(`kill ${pid}: ${ok ? 'сигнал отправлен' : 'нет'}`);
}
await new Promise((r) => setTimeout(r, 1500));
try {
  const out = execFileSync('ps', ['-W'], { encoding: 'utf8' });
  for (const pid of pids) {
    const alive = out.split('\n').some((l) => l.trim().endsWith(String(pid)));
    console.log(`  ${pid}: ${alive ? 'ВСЁ ЕЩЁ ЖИВ' : 'завершён'}`);
  }
} catch { /* ps может отсутствовать */ }
