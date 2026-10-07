// Проверка шима: заголовки ответа (content-type), Range-запрос, пустое тело 204.
// Запуск: source .env && node scripts/dot-shim-headers-test.mjs
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();

const img = 'https://mypins.site/logo.png';
const r1 = await fetch(img, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(6000) });
console.log('img:', r1.status, r1.headers.get('content-type'), 'body_len', (await r1.text()).length);

const r2 = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/events?select=id&limit=1`, {
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE}` },
});
const j = await r2.json();
console.log('supabase:', r2.status, Array.isArray(j) ? `строк ${j.length}` : 'не массив', r2.headers.get('content-type'));
