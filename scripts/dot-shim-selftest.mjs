// Проверка шима dot-curl-fetch: POST с не-ASCII телом (греческий + кириллица)
// и GET к Supabase. Запуск: source .env && node --import ./scripts/dot-proxy-import.mjs --import ничего
// (проще: node scripts/dot-shim-selftest.mjs)
import { installCurlFetch } from './dot-curl-fetch.mjs';

installCurlFetch();

const body = JSON.stringify({
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: 'Тест: греческий и кириллица — Φαίδων Νύχτες Καλοκαιριού' },
    { role: 'user', content: 'Переведи на русский: Τετάρτη 23 Σεπτεμβρίου & Πέμπτη 24 Σεπτεμβρίου 2026 | 19:00' },
  ],
  temperature: 0.3,
  max_tokens: 100,
});

const res = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
  body,
});
const text = await res.text();
console.log('status:', res.status, 'ok:', res.ok);
console.log('body:', text.slice(0, 400));
