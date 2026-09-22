// Проверка живого LLM-судьи автопроверки (scripts/moderation-llm.mjs):
// успешный вердикт, отказ по бранной карточке, поведение при неверном ключе
// и при недоступном сервере (должны быть повторы, а не мгновенный пропуск).
//
// Запуск: node scripts/check-moderation-llm.mjs   (нужен DEEPSEEK_API_KEY в .env)
// Тратит 2 реальных вызова DeepSeek — остальные ветки бесплатные.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const envPath = path.join(root, '.env');
if (!process.env.DEEPSEEK_API_KEY && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const moduleUrl = (tag = '') => 'file://' + path.join(root, 'scripts', 'moderation-llm.mjs').replace(/\\/g, '/') + tag;

const good = {
  title: 'Утренняя йога на пляже Чангу',
  description: 'Класс для всех уровней, коврики есть, начало в 8:00 у кафе The Lawn.',
  city: 'Чангу, Bali',
  address: 'Jl. Pantai Batu Bolong',
  category: 'sport',
};

async function run(label, fn) {
  const t0 = Date.now();
  let out;
  try {
    out = await fn();
  } catch (e) {
    out = { throw: e.message };
  }
  console.log(`\n[${label}] ${((Date.now() - t0) / 1000).toFixed(1)} с → ${JSON.stringify(out)}`);
  return out;
}

process.env.MODERATION_LLM_ATTEMPTS = process.env.MODERATION_LLM_ATTEMPTS || '3';
const mod = await import(moduleUrl());

console.log('A — обычное событие (ожидаем publish)');
await run('A', () => mod.judgeEventWithReason(good));

console.log('A2 — бранное название (ожидаем reject + profanity)');
await run('A2', () =>
  mod.judgeEventWithReason({ title: 'БРИТАНСКИЙ 3,14ЗДАТЫЙ КВИЗ', description: 'квиз про кино', city: 'Дананг' }));

console.log('B — неверный ключ (ожидаем 401 и БЕЗ повторов)');
const realKey = process.env.DEEPSEEK_API_KEY;
process.env.DEEPSEEK_API_KEY = 'sk-0000000000000000000000000000000';
await run('B', () => mod.judgeEventWithReason(good));
process.env.DEEPSEEK_API_KEY = realKey;

console.log('C — недоступный сервер (ожидаем 3 попытки ≈11 с)');
process.env.MODERATION_LLM_URL = 'http://127.0.0.1:9/v1/chat/completions';
process.env.MODERATION_LLM_TIMEOUT_MS = '4000';
const dead = await import(moduleUrl('?dead=1'));
await run('C', () => dead.judgeEventWithReason(good));

console.log('\nЕсли A/A2 дали вердикты, B — «HTTP 401» без повторов, C — три попытки: судья и повторы работают.');
