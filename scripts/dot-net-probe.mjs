// Проверка доступности Supabase REST с этого хоста (запуск 130).
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE;
console.log('url:', url, 'key len:', (key || '').length);
for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/events?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const txt = await res.text();
    console.log(`попытка ${i}: http ${res.status} за ${Date.now() - t0} мс | ${txt.slice(0, 120)}`);
  } catch (e) {
    console.log(`попытка ${i}: ОШИБКА за ${Date.now() - t0} мс | ${e.name}: ${e.message} | cause: ${e.cause?.code || e.cause?.message || '—'}`);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
