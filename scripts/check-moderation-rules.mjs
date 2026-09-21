// Проверка правил автопроверки по всей базе: где сработали правила и нет ли
// ложных срабатываний. Ничего не меняет и не вызывает LLM — только читает.
//
// Запуск: node scripts/check-moderation-rules.mjs [--limit=4000] [--status=moderation]
// Переменные: SUPABASE_URL (или VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE.
// Зачем: после правки списков мата/тем прогнать по реальным карточкам и
// глазами проверить строки в разделе «ОТКЛОНЕНО» — не попали ли нормальные.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRules } from './moderation-rules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '..', '.env');
if (!process.env.SUPABASE_URL && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const U = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!U || !KEY) {
  console.error('Нужны переменные: SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = Math.max(1, Number(limitArg ? limitArg.split('=')[1] : 4000) || 4000);
const statusArg = args.find((a) => a.startsWith('--status='));
const status = statusArg ? statusArg.split('=')[1] : '';

const COLS =
  'id,title,title_ru,title_en,description,description_ru,description_en,city,address,lat,lng,' +
  'category_id,website,start_date,status,source_type';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const rows = [];
for (let from = 0; from < LIMIT; from += 1000) {
  const filter = status ? `&status=eq.${status}` : '';
  const res = await fetch(`${U}/rest/v1/events?select=${COLS}${filter}&order=created_at.desc&offset=${from}&limit=1000`, { headers: H });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

const tally = { pass: 0, review: 0, reject: 0 };
const rejects = [];
const flagReviews = [];
for (const ev of rows) {
  const v = checkRules(ev);
  tally[v.verdict]++;
  const label = `${ev.title_ru || ev.title_en || ev.title} | ${ev.status}/${ev.source_type} | ${v.reason}`;
  if (v.verdict === 'reject') rejects.push(label);
  else if (v.flags.length) flagReviews.push(label);
}

console.log(`Проверено карточек: ${rows.length}${status ? ` (только ${status})` : ''}`);
console.log('Итог правил:', JSON.stringify(tally));
console.log(`\n=== ОТКЛОНЕНО (${rejects.length}) — проверить, нет ли нормальных событий ===`);
for (const r of rejects) console.log('• ' + r);
console.log(`\n=== НА ПРОВЕРКУ ПО ФЛАГАМ (${flagReviews.length}) ===`);
for (const r of flagReviews.slice(0, 50)) console.log('• ' + r);
