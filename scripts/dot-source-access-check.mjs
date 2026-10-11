#!/usr/bin/env node
// Проверка ДОСТУПА к источникам: прокси 10809 против прямого соединения.
// Смысл: прежде чем объявлять источник «мёртвым» или «не даёт данных», надо
// понять, что именно умерло — сам источник или локальный прокси 10809.
// Печатает код ответа и время; 000 = недоступно.
//
// Запуск из корня репозитория:  node scripts/dot-source-access-check.mjs [--proxy=http://127.0.0.1:10809]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const PROXY = (process.argv.find(a => a.startsWith('--proxy=')) || '').slice(8) || 'http://127.0.0.1:10809';
const OUT = join(mkdtempSync(join(tmpdir(), 'acc-')), 'out.txt');

const TARGETS = [
  ['cyprusnow API', 'https://cyprusnow.app/api/events?city=limassol&limit=1'],
  ['cyprusnow site', 'https://cyprusnow.app/'],
  ['cyprus.bz', 'https://cyprus.bz/'],
  ['baliforum API', 'https://baliforum.ru/api/v1/events?defaultList=1&page=1'],
  ['famagustatc', 'https://www.famagustatc.com/'],
  ['danang365', 'https://danang365.com/'],
  ['t.me', 'https://t.me/nyachang_ru'],
];

async function code(url, proxy) {
  const args = ['-s', '-o', OUT, '-w', '%{http_code} %{size_download} %{time_total}', '--max-time', '15'];
  if (proxy) args.push('-x', proxy);
  args.push(url);
  try {
    const { stdout } = await exec('curl', args, { windowsHide: true });
    return stdout.trim();
  } catch {
    return '000 - -';
  }
}

const rows = [];
for (const [name, url] of TARGETS) {
  const viaProxy = await code(url, PROXY);
  const direct = await code(url, null);
  const okP = viaProxy.startsWith('2') || viaProxy.startsWith('3') || viaProxy.startsWith('202');
  const okD = direct.startsWith('2') || direct.startsWith('3');
  rows.push({ name, viaProxy, direct, verdict: okP ? 'PROXY' : okD ? 'ПРЯМО' : 'НЕТ' });
}

console.log(`прокси: ${PROXY}`);
console.log('источник | через прокси (код байт сек) | напрямую | вердикт');
for (const r of rows) console.log(`${r.name} | ${r.viaProxy} | ${r.direct} | ${r.verdict}`);
const dead = rows.filter(r => r.verdict === 'НЕТ').length;
console.log(`ИТОГ: недоступны совсем ${dead} из ${rows.length}; через прокси достучались ${rows.filter(r => r.verdict === 'PROXY').length}, только напрямую ${rows.filter(r => r.verdict === 'ПРЯМО').length}`);
if (dead) console.log('ПОДСКАЗКА: если «через прокси» 000 у ВСЕХ источников — умер прокси 10809, а не источники; зонды с PROXY=0 работают напрямую.');
